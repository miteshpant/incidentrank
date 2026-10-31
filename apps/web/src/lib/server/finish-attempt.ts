import "server-only";
import { eq } from "drizzle-orm";
import { attemptActionGroups, attempts, type Attempt, type Scenario } from "@incidentrank/db";
import {
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  replayAttempt,
  type CandidateDeclaredFinishResult,
  type CompletionTier,
  type ReplayActionGroup,
  type SimulationState,
} from "@incidentrank/simulator";
import { SCORE_MAX_BY_DIMENSION } from "@incidentrank/scenarios/authoring";
import { db } from "./db";
import { resolveSimulationDefinition } from "./scenario-registry";
import { persistTerminalAttempt } from "./terminal-attempt";
import { materializeBenchmarkAttemptFactSafely } from "./benchmark/materialize";

export type FinishableAttempt = Attempt & { scenario: Scenario };

export interface FinishResult extends CandidateDeclaredFinishResult {
  score: { total: number; breakdown: Record<string, number>; maxPoints: Record<string, number> } | null;
  /** Same formula/value persistTerminalAttempt persists and scores
   * against — never recomputed client-side from state.resolvedAtMs,
   * which the engine no longer ever writes (Phase 7.1). Null whenever
   * the attempt never reached a resolved/failed terminal state. */
  recoveryTimeMs: number | null;
}

export type FinishAttemptResult =
  | { ok: true; result: FinishResult; alreadyApplied: boolean }
  | { ok: false; reason: "scenario_version_unresolvable" }
  | { ok: false; reason: "terminal" };

/**
 * Evaluates a candidate's explicit "Finish Incident" DECLARATION against
 * the current authoritative state and persists the terminal result — the
 * one place this happens for signed-in practice AND assessment attempts
 * alike (docs/implementation_plan/phase6.1.md's binding "server-
 * authoritative for both" decision). The client never submits a claimed
 * status or score; only an idempotency key and an optional note.
 *
 * `finishAttempt` (Finish) and the automatic completion path
 * (completeAutomaticAttemptRecord, POST /api/attempts/[attemptId]/
 * complete) are deliberately separate entry points representing
 * different TRIGGERS — Finish is a candidate decision ("I'm done"),
 * automatic completion is the engine detecting its own terminal
 * failure condition with no candidate action involved. Per the Phase
 * 7.1 doctrine, the engine can only ever auto-detect FAILURE — success
 * always requires this function to be called via an explicit Finish
 * declaration, for every scenario, regardless of completion mode. An
 * automatic system failure must never fabricate a completion
 * declaration/note/timestamp, so it never calls this function. Both
 * paths converge on the shared
 * persistTerminalAttempt primitive (./terminal-attempt.ts) for the
 * actual row mutation, so "completed, one outcome, score persisted once"
 * is enforced in exactly one place.
 *
 * Mirrors submitAction's transaction + row-lock + idempotency-key pattern
 * (apps/web/src/lib/server/assessment-runtime.ts) exactly, since Finish
 * is a one-shot terminal mutation analogous to a single action
 * submission — not advanceRuntime's optimistic-concurrency pattern, which
 * exists for *repeated* polling, a shape Finish does not have.
 */
export async function finishAttempt(
  attempt: FinishableAttempt,
  finishRequestId: string,
  note: string | null,
): Promise<FinishAttemptResult> {
  // Not an authorization decision — only a cheap optimization to skip
  // scenario resolution for a caller-supplied attempt that is ALREADY
  // known terminal and is NOT a matching retry. The actual terminal/
  // idempotency decision happens inside the transaction below against
  // the freshly row-locked attempt, never trusting the caller's
  // (possibly stale) `attempt.status` — a genuinely retried request
  // (e.g. a network retry whose first attempt already succeeded) must
  // still be recognized as idempotent even if the caller passed in a
  // pre-retry snapshot of the attempt.
  if (attempt.status !== "in_progress" && attempt.finishRequestId !== finishRequestId) {
    return { ok: false, reason: "terminal" };
  }

  const scenario = await resolveSimulationDefinition(attempt.scenario, attempt.scenarioVersion);
  if (!scenario) return { ok: false, reason: "scenario_version_unresolvable" };

  const outcome = await db.transaction(async (tx) => {
    const [lockedAttempt] = await tx
      .select()
      .from(attempts)
      .where(eq(attempts.id, attempt.id))
      .for("update");
    if (!lockedAttempt) {
      return { kind: "terminal" as const };
    }

    // Idempotency check happens BEFORE the terminal check, against the
    // freshly row-locked state — a retried request carrying the same key
    // must be recognized as already-applied even though the attempt is
    // now (correctly) terminal from the first application.
    if (lockedAttempt.finishRequestId === finishRequestId) {
      return { kind: "already_applied" as const, lockedAttempt };
    }

    if (lockedAttempt.status !== "in_progress") {
      return { kind: "terminal" as const };
    }

    const groups = await tx.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
      orderBy: (table, { asc }) => [asc(table.sequence)],
      with: { changes: { orderBy: (table, { asc }) => [asc(table.sequence)] } },
    });
    const replayGroups: ReplayActionGroup[] = groups.map((group) => ({
      elapsedMs: group.elapsedMs,
      changes: group.changes.map((change) => ({
        controlKey: change.controlKey,
        value: change.newValueJson as ReplayActionGroup["changes"][number]["value"],
      })),
    }));

    const elapsedMs = lockedAttempt.lastSimulationTimeMs ?? 0;
    const { state } = replayAttempt({ scenario, elapsedMs, actionGroups: replayGroups });

    const finishResult: FinishResult = {
      ...evaluateCandidateDeclaredFinish(scenario, state),
      score: null,
      recoveryTimeMs: null,
    };
    await persistFinishResult(tx, attempt, finishResult, finishRequestId, note);

    return { kind: "applied" as const, result: finishResult };
  });

  if (outcome.kind === "terminal") {
    return { ok: false, reason: "terminal" };
  }

  if (outcome.kind === "already_applied") {
    const result = rebuildFinishResultFromRow(outcome.lockedAttempt);
    return { ok: true, result, alreadyApplied: true };
  }

  // Phase 10E (docs/implementation_plan/phase10e.md §27): called only
  // AFTER the db.transaction above has already committed — never inside
  // it — so a benchmark-materialization bug can never roll back this
  // genuinely-new terminal completion. Awaited (not fire-and-forget) so
  // it reliably runs to completion before the request ends, but its own
  // internal try/catch guarantees a failure here is logged and never
  // thrown back to this caller. Only runs on a real first application
  // (outcome.kind === "applied"), never on an idempotent replay,
  // matching persistRankSnapshotIfChanged's own only-the-race-winner
  // convention one layer up.
  await materializeBenchmarkAttemptFactSafely(attempt.id);

  return { ok: true, result: outcome.result, alreadyApplied: false };
}

async function persistFinishResult(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  attempt: FinishableAttempt,
  finishResult: FinishResult,
  finishRequestId: string,
  note: string | null,
): Promise<void> {
  const scenario = await resolveSimulationDefinition(attempt.scenario, attempt.scenarioVersion);
  if (!scenario) throw new Error("scenario definition unresolvable during finish persistence");

  // A failed or declared_unstable Finish scores exactly like any other
  // unresolved/failed attempt via the existing terminalOverrides
  // mechanism — no special-casing for "declared" vs "never declared"
  // unresolved outcomes, per the binding decision to reuse the existing
  // bucket rather than add a third terminalOverrides key. A resolved
  // Finish gets a scoring-only resolvedAtMs override (see
  // extractFinishScoringInputs/deriveScoringResolvedAtMs) since the
  // engine itself never writes one for candidate_declared completion.
  const inputs = extractFinishScoringInputs(scenario, finishResult);

  finishResult.recoveryTimeMs =
    inputs.incidentStartedAtMs !== null &&
    (inputs.resolvedAtMs !== null || inputs.failedAtMs !== null)
      ? (inputs.resolvedAtMs ?? inputs.failedAtMs ?? 0) - inputs.incidentStartedAtMs
      : null;

  finishResult.score = await persistTerminalAttempt(tx, attempt, inputs, finishResult.state, {
    outcome: finishResult.outcome,
    completionTier: finishResult.completionTier,
    completionNote: note,
    completionDeclaredAt: new Date(),
    completionSimulationTimeMs: finishResult.state.simulationTimeMs,
    finishRequestId,
  });
}

function rebuildFinishResultFromRow(row: Attempt): FinishResult {
  // A retried finish request (same finishRequestId) returns the
  // already-persisted result rather than recomputing anything — the row
  // itself is now the source of truth. scoringResolvedAtMs was only ever
  // needed to produce the score at persist time, already baked into the
  // row's score columns, so it is not reconstructed here.
  const state = row.finalStateJson as SimulationState;
  return {
    outcome: row.outcome as "resolved" | "declared_unstable",
    completionTier: row.completionTier as CompletionTier | null,
    scoringResolvedAtMs: null,
    score:
      row.score !== null
        ? {
            total: row.score,
            breakdown: {
              recovery: row.recoveryScore ?? 0,
              customerImpact: row.customerImpactScore ?? 0,
              dataIntegrity: row.dataIntegrityScore ?? 0,
              reliability: row.reliabilityScore ?? 0,
              costEfficiency: row.costEfficiencyScore ?? 0,
              operationalEfficiency: row.operationalEfficiencyScore ?? 0,
            },
            // Phase 10G: no per-dimension maxPoints column is persisted
            // on `attempts` — every scenario in the catalog uses the
            // same fixed split (SCORE_MAX_BY_DIMENSION), so it's reused
            // here rather than adding a new column to store a value
            // that's already a catalog-wide constant.
            maxPoints: SCORE_MAX_BY_DIMENSION,
          }
        : null,
    recoveryTimeMs: row.recoveryTimeMs,
    state,
  };
}
