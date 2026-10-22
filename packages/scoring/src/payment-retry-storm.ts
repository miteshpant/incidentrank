import type { ScoringInputs } from "@incidentrank/simulator";
import { scoreAuthoredAttempt } from "@incidentrank/scenarios/authoring";
import { paymentRetryStormScoring } from "@incidentrank/scenarios";
import { SCORE_MAX, type ScoreResult } from "./types";

/**
 * Thin wrapper around the generic scoreAuthoredAttempt engine using
 * Payment Retry Storm's declarative scoring config (packages/scenarios/
 * src/payment-retry-storm/scoring.ts) — see docs/implementation_plan/
 * phase6.md's scoring-convergence mandate. This is the Phase 6 migration
 * test: see ./payment-retry-storm-equivalence.test.ts for the exact
 * point-for-point proof against the original hand-written scorer.
 */
export function scorePaymentRetryStormAttempt(inputs: ScoringInputs): ScoreResult {
  const result = scoreAuthoredAttempt(paymentRetryStormScoring, inputs);
  return { total: result.total, breakdown: result.breakdown, maxBreakdown: SCORE_MAX };
}
