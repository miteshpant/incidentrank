import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  CLIENT_RETRY_COUNT_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "baseline-ambiguous-ack": 480,
  "sustained-ambiguous-ack": 760,
  "timeout-amplified": 850,
  "timeout-amplified-compounding": 1_250,
  "retry-count-amplified": 880,
  "retry-count-amplified-compounding": 1_320,
  "logged-only": 650,
  "dedup-window-only": 380,
  "enforced-without-atomic": 90,
  deduplicated: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 180,
  perUnitMonthlyUsd: {
    [`${CLIENT_RETRY_COUNT_KEY}:3`]: 15,
    [`${CLIENT_RETRY_COUNT_KEY}:6`]: 40,
    [`${CLIENT_RETRY_COUNT_KEY}:10`]: 90,
    [`${REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY}:10`]: 10,
    [`${REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY}:30`]: 25,
    [`${REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY}:120`]: 55,
  },
};

/**
 * Full recovery: idempotency key handling is genuinely enforced AND
 * backed by atomic check-and-record, and duplicate side effects have
 * stopped entirely. Deliberately gates on the real observable
 * correctness counter itself (duplicateRequestRatePct <= 0), not merely
 * on duplicateSideEffectStatus, so success can never be satisfied by an
 * authored string label alone — and explicitly requires
 * duplicateSideEffectStatus === "deduplicated" so a state that merely has
 * duplicateRequestRatePct read as 0 at an instant (e.g. the very first
 * tick before any retries have even occurred) can never be mistaken for
 * the durable fix. A latency/throughput improvement alone (e.g. shortened
 * client timeout, raised retry count) can never satisfy this: both of
 * those harmful paths leave duplicateRequestRatePct well above zero even
 * though serviceLatencyMs and the apparent "request eventually succeeds"
 * outcome can look fine or even improved. Per the binding correctness
 * rule: a real correctness violation (a duplicated side effect) must
 * never satisfy success, however healthy availability/throughput metrics
 * look.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "duplicateRequestRatePct", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "serviceStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "duplicateSideEffectStatus", operator: "equals", comparedTo: "deduplicated" },
  ],
  sustainedSeconds: 20,
};

/**
 * Completion-mode audit (phase6c.md section 8) — see definition.ts for
 * the full reachable-state classification. No acceptableCondition is
 * authored: every non-optimal reachable state either still has an
 * ongoing correctness violation (duplicateRequestRatePct > 0,
 * duplicateSideEffectStatus === "duplicating") or is the unmitigated
 * baseline. Per the binding rule for this scenario specifically, a state
 * with a real correctness violation happening must never satisfy
 * acceptableCondition however healthy availability/throughput metrics
 * look — and every single non-optimal state here has an ongoing
 * violation, so there is deliberately no second tier.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "duplicateRequestRatePct", operator: "greater_than_or_equal", comparedTo: 50 },
  ],
  sustainedSeconds: 60,
};
