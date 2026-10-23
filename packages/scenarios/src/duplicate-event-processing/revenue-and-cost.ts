import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONSUMER_CONCURRENCY_KEY, DEDUPLICATION_WINDOW_SECONDS_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  redelivering: 420,
  "wasted-scaling": 650,
  "wasted-scaling-compounding": 950,
  "ack-timeout-amplified": 700,
  "idempotency-without-window": 180,
  "redelivery-compounding": 780,
  deduplicated: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 150,
  perUnitMonthlyUsd: {
    [`${CONSUMER_CONCURRENCY_KEY}:4`]: 0,
    [`${CONSUMER_CONCURRENCY_KEY}:8`]: 70,
    [`${CONSUMER_CONCURRENCY_KEY}:16`]: 180,
    [`${CONSUMER_CONCURRENCY_KEY}:32`]: 420,
    [`${DEDUPLICATION_WINDOW_SECONDS_KEY}:30`]: 10,
    [`${DEDUPLICATION_WINDOW_SECONDS_KEY}:120`]: 25,
    [`${DEDUPLICATION_WINDOW_SECONDS_KEY}:600`]: 60,
  },
};

/**
 * Full recovery: idempotent processing is genuinely in effect (a real
 * deduplication window to check identities against, not merely the
 * toggle flipped) and duplicate side effects have stopped entirely.
 * Deliberately gates on the real duplicate counters themselves
 * (duplicateOrderCount/duplicatePaymentCount <= 0), not merely on
 * duplicateSafetyStatus, so success can never be satisfied by an authored
 * string label alone — the actual observable correctness counters must
 * be zero. A throughput/ack-failure-rate improvement alone (e.g. scaled
 * concurrency, lowered ack timeout) can never satisfy this: both of
 * those harmful paths leave duplicateOrderCount/duplicatePaymentCount
 * climbing well above zero even though consumerThroughputPerSec and
 * ackFailureRatePct can look fine or even improved.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "duplicateOrderCount", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "duplicatePaymentCount", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "brokerStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "duplicateSafetyStatus", operator: "equals", comparedTo: "safe-deduplicated" },
  ],
  sustainedSeconds: 20,
};

/**
 * Completion-mode audit (phase6b.md section 8) — see definition.ts for
 * the full reachable-state classification. No acceptableCondition is
 * authored: every non-optimal reachable state either still has an
 * ongoing correctness violation (duplicateOrderCount/
 * duplicatePaymentCount > 0) or is the unmitigated/partially-mitigated
 * baseline. Per section 9's binding standard, an acceptableCondition must
 * never tolerate an ongoing correctness violation, and none of this
 * scenario's non-optimal states are safe to hand back — so there is
 * deliberately no second tier here.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "duplicateOrderCount", operator: "greater_than_or_equal", comparedTo: 500 },
  ],
  sustainedSeconds: 60,
};
