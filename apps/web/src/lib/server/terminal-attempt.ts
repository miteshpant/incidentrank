import "server-only";
import { and, eq } from "drizzle-orm";
import { assessmentCandidates, attempts, type Attempt } from "@incidentrank/db";
import type { ScoringInputs, SimulationState } from "@incidentrank/simulator";
import { db } from "./db";
import { scoreAttempt, type AttemptScoreResult } from "./scoring-helper";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface TerminalAttemptFields {
  outcome: "resolved" | "failed" | "declared_unstable" | "timed_out";
  completionTier?: "optimal" | "acceptable" | null;
  /** Only ever set by the candidate-declared Finish path — null for every
   * automatic (engine-detected) terminal transition. */
  completionNote?: string | null;
  completionDeclaredAt?: Date | null;
  completionSimulationTimeMs?: number | null;
  finishRequestId?: string | null;
}

/**
 * The single shared terminal-persistence primitive both completion
 * triggers converge on:
 *
 * ```text
 * automatic (engine) terminal event ───┐
 *                                      ↓
 *                            persistTerminalAttempt()
 *                                      ↑
 * candidate Finish declaration ────────┘
 * ```
 *
 * Per the binding Phase 6.1 distinction: `/complete` (completeAutomatic
 * AttemptRecord et al) calls this for an engine-detected automatic
 * terminal transition (success for automatic-mode scenarios, or failure
 * for any mode) — never for a candidate_declared scenario's sustained
 * success, which must never be converted into "resolved" without an
 * explicit candidate declaration. `finishAttempt` (apps/web/src/lib/
 * server/finish-attempt.ts) calls this for an explicit candidate Finish
 * declaration. Both converge here so "completed, one outcome, score
 * persisted once, runtime clock stopped, assessment candidate row
 * synced" is enforced in exactly one place rather than two parallel
 * implementations drifting apart.
 *
 * Always scoped to `WHERE status = 'in_progress'` — a concurrent writer
 * that already completed the attempt first wins; this call becomes a
 * no-op rather than double-persisting or clobbering.
 */
export async function persistTerminalAttempt(
  tx: TxOrDb,
  attempt: Pick<
    Attempt,
    "id" | "scenarioId" | "scenarioVersion" | "attemptType" | "assessmentId" | "startedAt"
  > & { scenario: { slug: string; ownershipType: string } },
  inputs: ScoringInputs,
  finalState: SimulationState,
  fields: TerminalAttemptFields,
): Promise<AttemptScoreResult> {
  const score = await scoreAttempt(attempt, inputs);

  const recoveryTimeMs =
    inputs.incidentStartedAtMs !== null &&
    (inputs.resolvedAtMs !== null || inputs.failedAtMs !== null)
      ? (inputs.resolvedAtMs ?? inputs.failedAtMs ?? 0) - inputs.incidentStartedAtMs
      : null;

  await tx
    .update(attempts)
    .set({
      status: "completed",
      outcome: fields.outcome,
      completionTier: fields.completionTier ?? null,
      completionNote: fields.completionNote ?? null,
      completionDeclaredAt: fields.completionDeclaredAt ?? null,
      completionSimulationTimeMs: fields.completionSimulationTimeMs ?? null,
      finishRequestId: fields.finishRequestId ?? null,
      completedAt: new Date(),
      incidentStartedAt: inputs.incidentStartedAtMs
        ? new Date(attempt.startedAt.getTime() + inputs.incidentStartedAtMs)
        : null,

      score: score.total,
      recoveryScore: score.breakdown.recovery,
      customerImpactScore: score.breakdown.customerImpact,
      dataIntegrityScore: score.breakdown.dataIntegrity,
      reliabilityScore: score.breakdown.reliability,
      costEfficiencyScore: score.breakdown.costEfficiency,
      operationalEfficiencyScore: score.breakdown.operationalEfficiency,

      recoveryTimeMs,
      revenueLossUsd: inputs.revenueLossUsd,

      peakSeverityRank: inputs.peakSeverityRank,
      peakInfrastructureCostUsd: inputs.peakMonthlyInfrastructureCostUsd,
      peakKafkaLagMessages: inputs.peakNumericValues.kafkaLagMessages ?? 0,

      numberOfConfigurationChanges: inputs.numberOfConfigurationChanges,
      numberOfBeneficialChanges: inputs.numberOfBeneficialChanges,
      numberOfHarmfulChanges: inputs.numberOfHarmfulChanges,

      finalStateJson: finalState,
      runtimeAnchoredAt: null,
    })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")));

  if (attempt.attemptType === "assessment" && attempt.assessmentId) {
    await tx
      .update(assessmentCandidates)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assessmentCandidates.attemptId, attempt.id));
  }

  return score;
}
