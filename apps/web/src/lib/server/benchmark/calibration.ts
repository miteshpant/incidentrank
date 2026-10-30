import "server-only";
import { eq, sql } from "drizzle-orm";
import { benchmarkAttemptFacts } from "@incidentrank/db";
import { db } from "../db";
import { sampleQualityFor, type SampleQuality } from "./sample-quality";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Per-scenario calibration aggregates (docs/implementation_plan/
 * phase10e.md §29). Pure descriptive statistics over
 * benchmark_attempt_facts — no ML, no inference, every number directly
 * derivable from stored evidence (§30: "No ML. No AI scoring.").
 */
export interface ScenarioCalibration {
  scenarioId: string;
  scenarioSlug: string;
  difficulty: string;
  category: string | null;

  totalAttempts: number;
  firstAttempts: number;
  repeatAttempts: number;

  resolvedPct: number;
  unstablePct: number;
  failedPct: number;
  timedOutPct: number;

  medianScore: number | null;
  medianDurationSeconds: number | null;

  dimensionMedians: {
    recovery: number | null;
    customerImpact: number | null;
    dataIntegrity: number | null;
    reliability: number | null;
    costEfficiency: number | null;
    operationalEfficiency: number | null;
  };

  rankBandDistribution: Record<string, number>;

  sampleQuality: SampleQuality;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}

/** All distinct scenarios with at least one benchmark fact — the universe calibrateScenario can be called over. */
export async function listBenchmarkedScenarioIds(tx: TxOrDb = db): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ scenarioId: benchmarkAttemptFacts.scenarioId })
    .from(benchmarkAttemptFacts);
  return rows.map((r) => r.scenarioId);
}

export async function calibrateScenario(
  scenarioId: string,
  tx: TxOrDb = db,
): Promise<ScenarioCalibration | null> {
  const rows = await tx.query.benchmarkAttemptFacts.findMany({
    where: eq(benchmarkAttemptFacts.scenarioId, scenarioId),
  });
  if (rows.length === 0) return null;

  const first = rows[0]!;
  const firstAttempts = rows.filter((r) => r.isFirstAttempt).length;
  const resolved = rows.filter((r) => r.terminalOutcome === "resolved").length;
  const unstable = rows.filter((r) => r.terminalOutcome === "declared_unstable").length;
  const failed = rows.filter((r) => r.terminalOutcome === "failed").length;
  const timedOut = rows.filter((r) => r.terminalOutcome === "timed_out").length;

  const scores = rows.map((r) => r.normalizedScore).filter((s): s is number => s !== null);
  const durations = rows.map((r) => r.durationSeconds);

  const rankBandDistribution: Record<string, number> = {};
  for (const r of rows) {
    if (r.rankAfter) rankBandDistribution[r.rankAfter] = (rankBandDistribution[r.rankAfter] ?? 0) + 1;
  }

  return {
    scenarioId,
    scenarioSlug: first.scenarioSlug,
    difficulty: first.difficulty,
    category: first.category,
    totalAttempts: rows.length,
    firstAttempts,
    repeatAttempts: rows.length - firstAttempts,
    resolvedPct: pct(resolved, rows.length),
    unstablePct: pct(unstable, rows.length),
    failedPct: pct(failed, rows.length),
    timedOutPct: pct(timedOut, rows.length),
    medianScore: median(scores),
    medianDurationSeconds: median(durations),
    dimensionMedians: {
      recovery: median(rows.map((r) => r.recoveryScore).filter((v): v is number => v !== null)),
      customerImpact: median(rows.map((r) => r.customerImpactScore).filter((v): v is number => v !== null)),
      dataIntegrity: median(rows.map((r) => r.dataIntegrityScore).filter((v): v is number => v !== null)),
      reliability: median(rows.map((r) => r.reliabilityScore).filter((v): v is number => v !== null)),
      costEfficiency: median(rows.map((r) => r.costEfficiencyScore).filter((v): v is number => v !== null)),
      operationalEfficiency: median(
        rows.map((r) => r.operationalEfficiencyScore).filter((v): v is number => v !== null),
      ),
    },
    rankBandDistribution,
    sampleQuality: sampleQualityFor(firstAttempts),
  };
}

export interface ScenarioCalibrationSummaryRow {
  scenarioId: string;
  scenarioSlug: string;
  difficulty: string;
  category: string | null;
  firstAttempts: number;
  totalAttempts: number;
  resolvedPct: number;
  medianScore: number | null;
  medianDurationSeconds: number | null;
  sampleQuality: SampleQuality;
}

/** The scenario-table listing for /admin/benchmark/scenarios — one aggregate query per scenario, acceptable at this phase's scale (built-in catalog is 100 scenarios). */
export async function listScenarioCalibrationSummaries(
  tx: TxOrDb = db,
): Promise<ScenarioCalibrationSummaryRow[]> {
  const scenarioIds = await listBenchmarkedScenarioIds(tx);
  const results: ScenarioCalibrationSummaryRow[] = [];
  for (const id of scenarioIds) {
    const calibration = await calibrateScenario(id, tx);
    if (!calibration) continue;
    results.push({
      scenarioId: calibration.scenarioId,
      scenarioSlug: calibration.scenarioSlug,
      difficulty: calibration.difficulty,
      category: calibration.category,
      firstAttempts: calibration.firstAttempts,
      totalAttempts: calibration.totalAttempts,
      resolvedPct: calibration.resolvedPct,
      medianScore: calibration.medianScore,
      medianDurationSeconds: calibration.medianDurationSeconds,
      sampleQuality: calibration.sampleQuality,
    });
  }
  return results;
}

export interface DecisionPatternSummary {
  commonFirstActions: Array<{ actionType: string; count: number }>;
  commonActionSequences: Array<{ sequence: string[]; count: number }>;
  highPerformingFirstActions: Array<{ actionType: string; resolvedPct: number; count: number }>;
}

/**
 * Basic descriptive decision-pattern summary (§30). Purely frequency-
 * based — no ML, no clustering, no scoring model. "High-performing" means
 * only "this first action's attempts resolved more often," a plain
 * conditional percentage, never a learned correlation.
 */
export async function calibrateDecisionPatterns(
  scenarioId: string,
  tx: TxOrDb = db,
): Promise<DecisionPatternSummary> {
  const facts = await tx.query.benchmarkAttemptFacts.findMany({
    where: eq(benchmarkAttemptFacts.scenarioId, scenarioId),
    with: {
      actionFacts: { orderBy: (t, { asc }) => [asc(t.sequenceNumber)] },
    },
  });

  const firstActionCounts = new Map<string, number>();
  const firstActionResolved = new Map<string, number>();
  const sequenceCounts = new Map<string, { sequence: string[]; count: number }>();

  for (const fact of facts) {
    const actions = fact.actionFacts.map((a) => a.actionType).filter((a): a is string => a !== null);
    if (actions.length === 0) continue;

    const firstAction = actions[0]!;
    firstActionCounts.set(firstAction, (firstActionCounts.get(firstAction) ?? 0) + 1);
    if (fact.terminalOutcome === "resolved") {
      firstActionResolved.set(firstAction, (firstActionResolved.get(firstAction) ?? 0) + 1);
    }

    const sequenceKey = actions.slice(0, 4).join(" -> ");
    const existing = sequenceCounts.get(sequenceKey);
    if (existing) existing.count += 1;
    else sequenceCounts.set(sequenceKey, { sequence: actions.slice(0, 4), count: 1 });
  }

  const commonFirstActions = [...firstActionCounts.entries()]
    .map(([actionType, count]) => ({ actionType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const commonActionSequences = [...sequenceCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const highPerformingFirstActions = [...firstActionCounts.entries()]
    .map(([actionType, count]) => ({
      actionType,
      count,
      resolvedPct: pct(firstActionResolved.get(actionType) ?? 0, count),
    }))
    .filter((r) => r.count >= 3) // never report a percentage off a single sample
    .sort((a, b) => b.resolvedPct - a.resolvedPct)
    .slice(0, 10);

  return { commonFirstActions, commonActionSequences, highPerformingFirstActions };
}

export interface BenchmarkOverallMetrics {
  benchmarkSubjects: number;
  qualifyingAttempts: number;
  firstAttempts: number;
  repeatAttempts: number;
  attemptsToday: number;
  attempts7d: number;
  attempts30d: number;
  distinctScenariosAttempted: number;
  projectionFailures: number;
}

/** The overview-page metrics for /admin/benchmark (§32). */
export async function getBenchmarkOverallMetrics(tx: TxOrDb = db): Promise<BenchmarkOverallMetrics> {
  const [subjectsRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_subjects`,
  );
  const [totalRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_attempt_facts`,
  );
  const [firstRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_attempt_facts WHERE is_first_attempt = true`,
  );
  const [todayRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_attempt_facts WHERE completed_at >= date_trunc('day', now())`,
  );
  const [sevenDayRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_attempt_facts WHERE completed_at >= now() - interval '7 days'`,
  );
  const [thirtyDayRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_attempt_facts WHERE completed_at >= now() - interval '30 days'`,
  );
  const [distinctScenariosRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(DISTINCT scenario_id)::text as count FROM benchmark_attempt_facts`,
  );
  const [failuresRow] = await tx.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text as count FROM benchmark_projection_failures`,
  );

  const total = Number(totalRow?.count ?? 0);
  const first = Number(firstRow?.count ?? 0);

  return {
    benchmarkSubjects: Number(subjectsRow?.count ?? 0),
    qualifyingAttempts: total,
    firstAttempts: first,
    repeatAttempts: total - first,
    attemptsToday: Number(todayRow?.count ?? 0),
    attempts7d: Number(sevenDayRow?.count ?? 0),
    attempts30d: Number(thirtyDayRow?.count ?? 0),
    distinctScenariosAttempted: Number(distinctScenariosRow?.count ?? 0),
    projectionFailures: Number(failuresRow?.count ?? 0),
  };
}
