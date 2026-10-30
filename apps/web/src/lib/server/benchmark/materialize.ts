import "server-only";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import {
  attempts,
  attemptActionChanges,
  attemptActionGroups,
  benchmarkActionFacts,
  benchmarkAttemptFacts,
  benchmarkProjectionFailures,
  benchmarkSubjects,
  rankSnapshots,
} from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { db } from "../db";
import { SCORING_VERSION, BENCHMARK_PROJECTION_VERSION, RANK_ALGORITHM_VERSION } from "./benchmark-versions";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Lazily gets-or-creates the pseudonymous benchmark subject for a user
 * (docs/implementation_plan/phase10e.md §7/§20 design decision) — one row
 * per user, created only on first qualifying attempt materialization, not
 * eagerly at signup. The random `id` (never derived from email/Clerk
 * identity) is what every analytical table should reference going
 * forward; `userId` is the sole link back, and account anonymization
 * (account-deletion.ts) never mutates users.id, so this FK survives
 * deletion automatically with no special-casing needed.
 */
async function getOrCreateBenchmarkSubject(tx: TxOrDb, userId: string): Promise<string> {
  const existing = await tx.query.benchmarkSubjects.findFirst({
    where: eq(benchmarkSubjects.userId, userId),
  });
  if (existing) return existing.id;

  const [inserted] = await tx
    .insert(benchmarkSubjects)
    .values({ userId })
    .onConflictDoNothing({ target: benchmarkSubjects.userId })
    .returning();
  if (inserted) return inserted.id;

  // Lost a concurrent-creation race — re-read rather than throw.
  const row = await tx.query.benchmarkSubjects.findFirst({
    where: eq(benchmarkSubjects.userId, userId),
  });
  if (!row) throw new Error(`Failed to get-or-create benchmark subject for user ${userId}`);
  return row.id;
}

export type MaterializeBenchmarkAttemptFactResult =
  | { materialized: true; benchmarkAttemptFactId: string }
  | { materialized: false; reason: "not_practice" | "not_incidentrank_owned" | "not_found" | "not_completed" };

/**
 * Materializes (or rematerializes) the benchmark attempt fact for one
 * attempt — the sole write path into benchmark_attempt_facts /
 * benchmark_action_facts, driven entirely from authoritative attempt/
 * action data (phase10e.md §19: never a second capture mechanism).
 *
 * Scope enforcement (§24, design decision #12): hard-filters
 * attemptType==='practice' AND scenario.ownershipType==='incidentrank'
 * at THIS call site — never relied upon only at the caller's trigger
 * level, so a future caller cannot accidentally benchmark an assessment
 * or an organization-private scenario merely by calling this function.
 *
 * Idempotent (§28): upserts on (attemptId, benchmarkProjectionVersion) —
 * safe to call any number of times for the same attempt at the same
 * projection version; a version bump creates a parallel new-version row
 * rather than overwriting history.
 *
 * This function performs its own `db.transaction` and must NEVER be
 * called from inside the attempt's own terminal-persistence transaction
 * (terminal-attempt.ts) — see materializeBenchmarkAttemptFactSafely for
 * the non-blocking, failure-isolated wrapper every real call site uses.
 */
export async function materializeBenchmarkAttemptFact(
  attemptId: string,
): Promise<MaterializeBenchmarkAttemptFactResult> {
  return db.transaction(async (tx) => {
    const attempt = await tx.query.attempts.findMany({
      where: eq(attempts.id, attemptId),
      with: { scenario: true },
      limit: 1,
    });
    const row = attempt[0];
    if (!row) return { materialized: false, reason: "not_found" };
    if (row.attemptType !== "practice") return { materialized: false, reason: "not_practice" };
    if (row.scenario.ownershipType !== "incidentrank") {
      return { materialized: false, reason: "not_incidentrank_owned" };
    }
    if (row.status !== "completed" || !row.outcome || !row.completedAt) {
      return { materialized: false, reason: "not_completed" };
    }

    const catalogEntry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, row.scenario.slug);
    if (!catalogEntry) {
      throw new Error(`No built-in scenario catalog entry found for slug "${row.scenario.slug}"`);
    }

    const benchmarkSubjectId = await getOrCreateBenchmarkSubject(tx, row.userId);

    // First-vs-repeat (§25): count this user's qualifying (completed,
    // practice, same scenario) attempts up to and including this one, by
    // completion time — deterministic regardless of materialization order.
    const priorAttempts = await tx.query.attempts.findMany({
      where: and(
        eq(attempts.userId, row.userId),
        eq(attempts.scenarioId, row.scenarioId),
        eq(attempts.attemptType, "practice"),
        eq(attempts.status, "completed"),
        lt(attempts.completedAt, row.completedAt),
      ),
      columns: { id: true },
    });
    const attemptNumberForScenario = priorAttempts.length + 1;
    const isFirstAttempt = attemptNumberForScenario === 1;

    const durationSeconds = Math.max(
      0,
      Math.round((row.completedAt.getTime() - row.startedAt.getTime()) / 1000),
    );

    // Rank context (§21's rank_before/rank_after) — purely descriptive,
    // never recomputed here. The snapshot this exact attempt triggered (if
    // any — persistRankSnapshotIfChanged only inserts on a material
    // change) is "after"; the latest snapshot strictly before this
    // attempt's completion is "before". Absence of evidence on either
    // side is a legitimate null, never defaulted to a bogus band.
    const [afterSnapshot, beforeSnapshot] = await Promise.all([
      tx.query.rankSnapshots.findFirst({
        where: and(eq(rankSnapshots.userId, row.userId), eq(rankSnapshots.triggerAttemptId, attemptId)),
      }),
      tx.query.rankSnapshots.findFirst({
        where: and(eq(rankSnapshots.userId, row.userId), lt(rankSnapshots.createdAt, row.completedAt)),
        orderBy: desc(rankSnapshots.createdAt),
      }),
    ]);

    const [fact] = await tx
      .insert(benchmarkAttemptFacts)
      .values({
        attemptId: row.id,
        benchmarkSubjectId,
        scenarioId: row.scenarioId,
        scenarioVersion: row.scenarioVersion,
        scenarioSlug: row.scenario.slug,
        difficulty: catalogEntry.definition.difficulty,
        category: catalogEntry.definition.library?.category ?? null,
        scoringVersion: SCORING_VERSION,
        rankAlgorithmVersion: RANK_ALGORITHM_VERSION,
        benchmarkProjectionVersion: BENCHMARK_PROJECTION_VERSION,
        attemptNumberForScenario,
        isFirstAttempt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        durationSeconds,
        terminalOutcome: row.outcome,
        rawScore: row.score,
        normalizedScore: row.score,
        recoveryScore: row.recoveryScore,
        customerImpactScore: row.customerImpactScore,
        dataIntegrityScore: row.dataIntegrityScore,
        reliabilityScore: row.reliabilityScore,
        costEfficiencyScore: row.costEfficiencyScore,
        operationalEfficiencyScore: row.operationalEfficiencyScore,
        rankBefore: beforeSnapshot?.rankBand ?? null,
        rankAfter: afterSnapshot?.rankBand ?? beforeSnapshot?.rankBand ?? null,
      })
      .onConflictDoUpdate({
        target: [benchmarkAttemptFacts.attemptId, benchmarkAttemptFacts.benchmarkProjectionVersion],
        set: {
          scenarioVersion: row.scenarioVersion,
          difficulty: catalogEntry.definition.difficulty,
          category: catalogEntry.definition.library?.category ?? null,
          scoringVersion: SCORING_VERSION,
          rankAlgorithmVersion: RANK_ALGORITHM_VERSION,
          attemptNumberForScenario,
          isFirstAttempt,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          durationSeconds,
          terminalOutcome: row.outcome,
          rawScore: row.score,
          normalizedScore: row.score,
          recoveryScore: row.recoveryScore,
          customerImpactScore: row.customerImpactScore,
          dataIntegrityScore: row.dataIntegrityScore,
          reliabilityScore: row.reliabilityScore,
          costEfficiencyScore: row.costEfficiencyScore,
          operationalEfficiencyScore: row.operationalEfficiencyScore,
          rankBefore: beforeSnapshot?.rankBand ?? null,
          rankAfter: afterSnapshot?.rankBand ?? beforeSnapshot?.rankBand ?? null,
        },
      })
      .returning();
    if (!fact) throw new Error(`Failed to upsert benchmark_attempt_facts for attempt ${attemptId}`);

    // Action facts (§22/§23): a pure read-projection over the already-
    // captured, already-ordered attemptActionGroups/attemptActionChanges
    // — no new capture mechanism. One action fact per action GROUP (not
    // per individual control change), matching §22's action_id/
    // action_group_id/sequence_number/elapsed_seconds shape.
    const groups = await tx.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attemptId),
      orderBy: asc(attemptActionGroups.sequence),
      with: { changes: { orderBy: asc(attemptActionChanges.sequence) } },
    });

    await tx
      .delete(benchmarkActionFacts)
      .where(eq(benchmarkActionFacts.benchmarkAttemptFactId, fact.id));

    if (groups.length > 0) {
      await tx.insert(benchmarkActionFacts).values(
        groups.map((group) => {
          const changes = group.changes;
          // Dominant/first controlKey among this group's changes — never
          // an invented subjective label (§22).
          const actionType = changes[0]?.controlKey ?? null;
          return {
            benchmarkAttemptFactId: fact.id,
            sequenceNumber: group.sequence,
            actionId: group.id,
            actionGroupId: group.id,
            actionType,
            elapsedSeconds: Math.max(0, Math.round(group.elapsedMs / 1000)),
            // Allowlisted system-state snapshot — only the structured
            // control-value diff the simulator already captured, never
            // the full finalStateJson blob and never free-text reasoning.
            systemStateBeforeJson: Object.fromEntries(
              changes.map((c) => [c.controlKey, c.previousValueJson]),
            ),
            systemStateAfterJson: Object.fromEntries(
              changes.map((c) => [c.controlKey, c.newValueJson]),
            ),
          };
        }),
      );
    }

    return { materialized: true, benchmarkAttemptFactId: fact.id };
  });
}

/**
 * The non-blocking, failure-isolated wrapper every real completion call
 * site uses (phase10e.md §27, design decision #8). Runs its OWN
 * transaction (via materializeBenchmarkAttemptFact above), called only
 * AFTER the caller's own terminal-persistence transaction has already
 * committed — never nested inside it, so a benchmark bug can never roll
 * back or otherwise affect the real completed attempt. A thrown error
 * here is caught, logged to benchmark_projection_failures for later
 * `rebuildBenchmarkAttempt` retry, and never re-thrown.
 */
export async function materializeBenchmarkAttemptFactSafely(attemptId: string): Promise<void> {
  try {
    await materializeBenchmarkAttemptFact(attemptId);
  } catch (error) {
    try {
      await db.insert(benchmarkProjectionFailures).values({
        attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Even the failure-log write itself must never propagate — this is
      // the last line of defense protecting the already-committed attempt.
    }
  }
}

export async function rebuildBenchmarkAttempt(
  attemptId: string,
): Promise<MaterializeBenchmarkAttemptFactResult> {
  return materializeBenchmarkAttemptFact(attemptId);
}

/** Rebuilds every qualifying (completed, practice, incidentrank-owned) attempt for one user — admin/internal use, never called from a request's hot path. */
export async function rebuildBenchmarkForUser(userId: string): Promise<number> {
  const qualifying = await db.query.attempts.findMany({
    where: and(
      eq(attempts.userId, userId),
      eq(attempts.attemptType, "practice"),
      eq(attempts.status, "completed"),
    ),
    columns: { id: true },
  });
  let count = 0;
  for (const a of qualifying) {
    const result = await materializeBenchmarkAttemptFact(a.id);
    if (result.materialized) count += 1;
  }
  return count;
}

/** Rebuilds every qualifying attempt for one scenario — admin/internal use. */
export async function rebuildBenchmarkForScenario(scenarioId: string): Promise<number> {
  const qualifying = await db.query.attempts.findMany({
    where: and(
      eq(attempts.scenarioId, scenarioId),
      eq(attempts.attemptType, "practice"),
      eq(attempts.status, "completed"),
    ),
    columns: { id: true },
  });
  let count = 0;
  for (const a of qualifying) {
    const result = await materializeBenchmarkAttemptFact(a.id);
    if (result.materialized) count += 1;
  }
  return count;
}
