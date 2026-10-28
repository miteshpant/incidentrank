import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  attempts,
  rankSnapshots,
  scenarios,
  type RankSnapshot,
} from "@incidentrank/db";
import {
  BUILT_IN_SCENARIO_CATALOG,
  getBuiltInScenarioEntry,
  type ScenarioCategory,
} from "@incidentrank/scenarios";
import { db } from "./db";
import { isEngineerRankEnabled } from "./feature-flags";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Phase 10C Engineer Rank (docs/implementation_plan/phase10c.md Part A).
 * This module is the ONLY place rank math happens — every reader (profile
 * panel, admin rebuild route, global leaderboard) reads persisted
 * rank_snapshots rows, never recomputes independently (spec §10).
 */

export const ENGINEER_RANK_ALGORITHM_VERSION = "v1";

export type RankBand =
  | "developing"
  | "intermediate"
  | "senior"
  | "staff"
  | "senior_staff"
  | "principal";

export type RankConfidence = "low" | "medium" | "high";

export type ScoringDimension =
  | "recovery"
  | "customerImpact"
  | "dataIntegrity"
  | "reliability"
  | "costEfficiency"
  | "operationalEfficiency";

const SCORING_DIMENSIONS: readonly ScoringDimension[] = [
  "recovery",
  "customerImpact",
  "dataIntegrity",
  "reliability",
  "costEfficiency",
  "operationalEfficiency",
];

const RANK_BANDS_ASCENDING: readonly RankBand[] = [
  "developing",
  "intermediate",
  "senior",
  "staff",
  "senior_staff",
  "principal",
];

// Chosen against the real built-in catalog's difficulty distribution
// (beginner=1, intermediate≈10, senior=24, staff=28, senior_staff=16,
// principal=23 of 100) — a tight linear 1.00-1.40 scale barely separates
// the dominant senior/staff/principal cluster, so this uses a wider
// linear spread instead. See phase10c completion report for the full
// justification.
const DIFFICULTY_FACTORS: Record<string, number> = {
  beginner: 0.85,
  intermediate: 1.0,
  senior: 1.15,
  staff: 1.3,
  senior_staff: 1.45,
  principal: 1.6,
};

// Resolved outcome contributes fully; declared_unstable counts as partial
// evidence of incomplete mastery; failed/timed_out contribute a small
// positive floor. Never negative, never zero — "do not simply erase poor
// attempts" (spec §6) without inventing penalty-decay mechanics this
// codebase's 0-1000 scoring convention has no precedent for.
const OUTCOME_FACTORS: Record<QualifyingOutcome, number> = {
  resolved: 1.0,
  declared_unstable: 0.5,
  failed: 0.25,
  timed_out: 0.25,
};

// Evidence thresholds per band, calibrated against the real catalog sizes
// so no band's minimum exceeds roughly half that band-and-above's
// catalog (spec §8 — prevents single-attempt rank inflation).
interface BandThreshold {
  minQualifyingScenarios: number;
  minDistinctSkillAreas: number;
  scoreMin: number;
  scoreMax: number;
}

const BAND_THRESHOLDS: Record<RankBand, BandThreshold> = {
  developing: { minQualifyingScenarios: 1, minDistinctSkillAreas: 1, scoreMin: 0.0, scoreMax: 0.35 },
  intermediate: { minQualifyingScenarios: 3, minDistinctSkillAreas: 2, scoreMin: 0.35, scoreMax: 0.55 },
  senior: { minQualifyingScenarios: 6, minDistinctSkillAreas: 3, scoreMin: 0.55, scoreMax: 0.75 },
  staff: { minQualifyingScenarios: 10, minDistinctSkillAreas: 3, scoreMin: 0.75, scoreMax: 0.95 },
  senior_staff: { minQualifyingScenarios: 14, minDistinctSkillAreas: 4, scoreMin: 0.95, scoreMax: 1.15 },
  principal: { minQualifyingScenarios: 18, minDistinctSkillAreas: 4, scoreMin: 1.15, scoreMax: 1.6 },
};

export type QualifyingOutcome = "resolved" | "failed" | "declared_unstable" | "timed_out";

export interface QualifyingAttemptEvidence {
  attemptId: string;
  scenarioId: string;
  /** Resolved from the PINNED scenario version at evidence-gathering time, never live catalog state. */
  category: ScenarioCategory;
  difficulty: string;
  outcome: QualifyingOutcome;
  /** 0-1000, attempts.score. */
  score: number;
  dimensionBreakdown: Partial<Record<ScoringDimension, number | null>>;
  completedAt: Date;
}

export interface EngineerRankResult {
  rankBand: RankBand | null;
  provisional: boolean;
  confidence: RankConfidence | null;
  normalizedScore: number | null;
  dimensionScores: Record<ScoringDimension, number> | null;
  skillScores: Record<string, { attempts: number; avgNormalizedScore: number }>;
  attemptsCount: number;
  qualifyingAttempts: number;
  evidenceBreadth: number;
  distinctSkillAreas: number;
  algorithmVersion: string;
}

function normalizeAttemptScore(evidence: QualifyingAttemptEvidence): number {
  const difficultyFactor = DIFFICULTY_FACTORS[evidence.difficulty] ?? DIFFICULTY_FACTORS.intermediate;
  const outcomeFactor = OUTCOME_FACTORS[evidence.outcome];
  return (evidence.score / 1000) * difficultyFactor * outcomeFactor;
}

function bandFromThresholds(qualifyingAttempts: number, distinctSkillAreas: number): RankBand | null {
  let achieved: RankBand | null = null;
  for (const band of RANK_BANDS_ASCENDING) {
    const t = BAND_THRESHOLDS[band];
    if (qualifyingAttempts >= t.minQualifyingScenarios && distinctSkillAreas >= t.minDistinctSkillAreas) {
      achieved = band;
    }
  }
  return achieved;
}

function bandFromScore(normalizedScore: number): RankBand | null {
  let achieved: RankBand | null = null;
  for (const band of RANK_BANDS_ASCENDING) {
    const t = BAND_THRESHOLDS[band];
    if (normalizedScore >= t.scoreMin) {
      achieved = band;
    }
  }
  return achieved;
}

function bandOrdinal(band: RankBand): number {
  return RANK_BANDS_ASCENDING.indexOf(band);
}

/**
 * Pure, deterministic. Never touches attemptType or payment status —
 * those exclusions are enforced structurally by what the caller is
 * allowed to put into `evidence`, not by a runtime check here (spec
 * §18/§5/§6).
 */
export function computeEngineerRank(evidence: QualifyingAttemptEvidence[]): EngineerRankResult {
  // Best-of per scenario (spec §19): repeated attempts on one scenario
  // can only ever contribute that scenario's single best normalized
  // score, never average/sum — gaming-resistant by construction (spec
  // §20).
  const bestByScenario = new Map<string, { evidence: QualifyingAttemptEvidence; normalized: number }>();
  for (const e of evidence) {
    const normalized = normalizeAttemptScore(e);
    const existing = bestByScenario.get(e.scenarioId);
    if (!existing || normalized > existing.normalized) {
      bestByScenario.set(e.scenarioId, { evidence: e, normalized });
    }
  }

  const qualifying = [...bestByScenario.values()];
  const qualifyingAttempts = qualifying.length;

  if (qualifyingAttempts === 0) {
    return {
      rankBand: null,
      provisional: false,
      confidence: null,
      normalizedScore: null,
      dimensionScores: null,
      skillScores: {},
      attemptsCount: evidence.length,
      qualifyingAttempts: 0,
      evidenceBreadth: 0,
      distinctSkillAreas: 0,
      algorithmVersion: ENGINEER_RANK_ALGORITHM_VERSION,
    };
  }

  const distinctSkillAreas = new Set(qualifying.map((q) => q.evidence.category)).size;
  const normalizedScore =
    qualifying.reduce((sum, q) => sum + q.normalized, 0) / qualifyingAttempts;

  const thresholdBand = bandFromThresholds(qualifyingAttempts, distinctSkillAreas);
  const scoreBand = bandFromScore(normalizedScore);

  // Achieved band = min(threshold-implied band, score-implied band) — a
  // user cannot reach a high band by score alone without the breadth,
  // nor by breadth alone without the score (spec §8/§20).
  let rankBand: RankBand | null = null;
  if (thresholdBand !== null && scoreBand !== null) {
    rankBand = bandOrdinal(thresholdBand) <= bandOrdinal(scoreBand) ? thresholdBand : scoreBand;
  }

  if (rankBand === null) {
    return {
      rankBand: null,
      provisional: false,
      confidence: null,
      normalizedScore,
      dimensionScores: null,
      skillScores: {},
      attemptsCount: evidence.length,
      qualifyingAttempts,
      evidenceBreadth: qualifyingAttempts,
      distinctSkillAreas,
      algorithmVersion: ENGINEER_RANK_ALGORITHM_VERSION,
    };
  }

  const min = BAND_THRESHOLDS[rankBand].minQualifyingScenarios;
  let confidence: RankConfidence;
  let provisional: boolean;
  if (qualifyingAttempts < min) {
    // Should be unreachable given bandFromThresholds's own logic, but
    // guards against a future threshold-table edit creating a gap.
    confidence = "low";
    provisional = true;
  } else if (qualifyingAttempts < 2 * min) {
    confidence = "low";
    provisional = true;
  } else if (qualifyingAttempts < 4 * min) {
    confidence = "medium";
    provisional = false;
  } else {
    confidence = "high";
    provisional = false;
  }

  const dimensionScores = {} as Record<ScoringDimension, number>;
  for (const dim of SCORING_DIMENSIONS) {
    const values = qualifying
      .map((q) => q.evidence.dimensionBreakdown[dim])
      .filter((v): v is number => typeof v === "number");
    dimensionScores[dim] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  const skillScores: Record<string, { attempts: number; avgNormalizedScore: number }> = {};
  for (const q of qualifying) {
    const key = q.evidence.category;
    const existing = skillScores[key];
    if (existing) {
      const totalScore = existing.avgNormalizedScore * existing.attempts + q.normalized;
      existing.attempts += 1;
      existing.avgNormalizedScore = totalScore / existing.attempts;
    } else {
      skillScores[key] = { attempts: 1, avgNormalizedScore: q.normalized };
    }
  }

  return {
    rankBand,
    provisional,
    confidence,
    normalizedScore,
    dimensionScores,
    skillScores,
    attemptsCount: evidence.length,
    qualifyingAttempts,
    evidenceBreadth: qualifyingAttempts,
    distinctSkillAreas,
    algorithmVersion: ENGINEER_RANK_ALGORITHM_VERSION,
  };
}

/**
 * Gathers qualifying evidence for a user and computes their rank. Scoped
 * to attemptType='practice', status='completed', and built-in
 * (ownershipType='incidentrank') scenarios only (spec §5/§6 and the
 * explicit V1 scoping decision to exclude org-owned practice scenarios —
 * they aren't catalog-difficulty-calibrated against the same scale).
 * Difficulty/category are resolved from the built-in catalog by slug —
 * source-controlled, immutable, so spec §59's "don't evaluate against
 * today's modified metadata" risk does not arise for this scoped set.
 */
export async function rebuildEngineerRankForUser(
  tx: TxOrDb,
  userId: string,
): Promise<EngineerRankResult> {
  const rows = await tx
    .select({
      attemptId: attempts.id,
      scenarioId: attempts.scenarioId,
      outcome: attempts.outcome,
      score: attempts.score,
      recoveryScore: attempts.recoveryScore,
      customerImpactScore: attempts.customerImpactScore,
      dataIntegrityScore: attempts.dataIntegrityScore,
      reliabilityScore: attempts.reliabilityScore,
      costEfficiencyScore: attempts.costEfficiencyScore,
      operationalEfficiencyScore: attempts.operationalEfficiencyScore,
      completedAt: attempts.completedAt,
      scenarioSlug: scenarios.slug,
      ownershipType: scenarios.ownershipType,
    })
    .from(attempts)
    .innerJoin(scenarios, eq(attempts.scenarioId, scenarios.id))
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.attemptType, "practice"),
        eq(attempts.status, "completed"),
        eq(scenarios.ownershipType, "incidentrank"),
      ),
    );

  const evidence: QualifyingAttemptEvidence[] = [];
  for (const row of rows) {
    if (!row.outcome || row.score === null || !row.completedAt) continue;
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, row.scenarioSlug);
    if (!entry?.definition.library) continue;

    evidence.push({
      attemptId: row.attemptId,
      scenarioId: row.scenarioId,
      category: entry.definition.library.category,
      difficulty: entry.definition.difficulty,
      outcome: row.outcome as QualifyingOutcome,
      score: row.score,
      dimensionBreakdown: {
        recovery: row.recoveryScore,
        customerImpact: row.customerImpactScore,
        dataIntegrity: row.dataIntegrityScore,
        reliability: row.reliabilityScore,
        costEfficiency: row.costEfficiencyScore,
        operationalEfficiency: row.operationalEfficiencyScore,
      },
      completedAt: row.completedAt,
    });
  }

  return computeEngineerRank(evidence);
}

const NORMALIZED_SCORE_EPSILON = 0.01;

function snapshotsMateriallyDiffer(a: EngineerRankResult, prev: RankSnapshot): boolean {
  if (a.rankBand !== prev.rankBand) return true;
  if (a.provisional !== prev.provisional) return true;
  if (a.confidence !== prev.confidence) return true;
  const prevScore = prev.normalizedScore;
  if (a.normalizedScore === null || Math.abs(a.normalizedScore - prevScore) > NORMALIZED_SCORE_EPSILON) {
    return true;
  }
  return false;
}

async function insertSnapshot(
  tx: TxOrDb,
  userId: string,
  result: EngineerRankResult,
  triggerAttemptId: string | null,
): Promise<void> {
  if (result.rankBand === null || result.confidence === null || result.normalizedScore === null || !result.dimensionScores) {
    return;
  }
  await tx.insert(rankSnapshots).values({
    userId,
    algorithmVersion: result.algorithmVersion,
    rankBand: result.rankBand,
    provisional: result.provisional,
    confidence: result.confidence,
    normalizedScore: result.normalizedScore,
    dimensionScoresJson: result.dimensionScores,
    skillScoresJson: result.skillScores,
    attemptsCount: result.attemptsCount,
    qualifyingAttempts: result.qualifyingAttempts,
    evidenceBreadth: result.evidenceBreadth,
    distinctSkillAreas: result.distinctSkillAreas,
    triggerAttemptId,
  });
}

/**
 * Called after a practice attempt completes. Inserts a new snapshot only
 * if the result materially differs from the latest existing one (or none
 * exists yet) — avoids near-duplicate snapshot spam while still
 * satisfying "rank updates after qualifying practice completion" (spec
 * §56) whenever something visible actually changes. No-ops entirely when
 * the feature flag is off.
 */
export async function persistRankSnapshotIfChanged(
  tx: TxOrDb,
  userId: string,
  triggerAttemptId: string | null,
): Promise<void> {
  if (!isEngineerRankEnabled()) return;

  const result = await rebuildEngineerRankForUser(tx, userId);
  if (result.rankBand === null) return;

  const latest = await getLatestRankSnapshotForUser(userId, tx);
  if (latest && !snapshotsMateriallyDiffer(result, latest)) return;

  await insertSnapshot(tx, userId, result, triggerAttemptId);
}

/**
 * Admin/internal rebuild capability (spec §58). Always force-writes a
 * fresh snapshot regardless of whether it matches the latest existing
 * one — a rebuild must be unconditionally honest about current state,
 * never skip a write for "no change." Runs in its own transaction, never
 * the caller's.
 */
export async function rebuildAndPersistRank(userId: string): Promise<EngineerRankResult> {
  return db.transaction(async (tx) => {
    const result = await rebuildEngineerRankForUser(tx, userId);
    if (result.rankBand !== null) {
      await insertSnapshot(tx, userId, result, null);
    }
    return result;
  });
}

export async function getLatestRankSnapshotForUser(
  userId: string,
  tx: TxOrDb = db,
): Promise<RankSnapshot | null> {
  const row = await tx.query.rankSnapshots.findFirst({
    where: eq(rankSnapshots.userId, userId),
    orderBy: desc(rankSnapshots.createdAt),
  });
  return row ?? null;
}
