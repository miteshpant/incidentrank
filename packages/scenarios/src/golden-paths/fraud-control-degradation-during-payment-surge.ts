import type { ScenarioGoldenPath } from "./types";
import { MANUAL_REVIEW_QUEUE_PRIORITY_KEY } from "../fraud-control-degradation-during-payment-surge/definition";

/**
 * Extracted from fraud-control-degradation-during-payment-surge.test.ts's
 * SAFE_DRAIN_ACTIONS, used by "reaching the fully-drained state via
 * risk-weighted triage satisfies successCondition at the optimal tier"
 * and "optimal path (fully-drained) scores near-maximum with full
 * dataIntegrity credit" — completionTier "optimal". RISK_PROVIDER_RECOVERED_MS
 * = 690_000; DRAIN_WINDOW_FULLY_DRAINED_MS = 1_230_000 (from
 * timed-events.ts).
 */
export const fraudControlDegradationDuringPaymentSurgeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "fraud-control-degradation-during-payment-surge",
  actions: [{ atMs: 691_000, controlKey: MANUAL_REVIEW_QUEUE_PRIORITY_KEY, value: "risk-weighted" }],
  finishAtMs: 1_265_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
