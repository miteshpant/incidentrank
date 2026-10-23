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
import { db } from "./db";
import { resolveSimulationDefinition } from "./scenario-registry";
import { persistTerminalAttempt } from "./terminal-attempt";

export type FinishableAttempt = Attempt & { scenario: Scenario };

export interface FinishResult extends CandidateDeclaredFinishResult {
  score: { total: number; breakdown: Record<string, number> } | null;
}

export type FinishAttemptResult =
  | { ok: true; result: FinishResult; alreadyApplied: boolean }
  | { ok: false; reason: "scenario_version_unresolvable" }
  | { ok: false; reason: "terminal" }
  | { ok: false; reason: "not_candidate_declared" };

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
 * condition (success for automatic-mode scenarios, or failure for any
 * mode) with no candidate action involved. An automatic system failure
 * must never fabricate a completion declaration/note/timestamp, so it
 * never calls this function. Both converge on the shared
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

  if ((scenario.completion?.mode ?? "automatic") !== "candidate_declared") {
    return { ok: false, reason: "not_candidate_declared" };
  }

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

    const finishResult: FinishResult = { ...evaluateCandidateDeclaredFinish(scenario, state), score: null };
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
          }
        : null,
    state,
  };
}
