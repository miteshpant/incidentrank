import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { INSTANCE_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "compounded-skew": 700,
  "capacity-added-skew-persists": 520,
  "weights-adjusted-skew-persists": 500,
  "unmitigated-skew": 440,
  "sensitive-health-check-partial": 180,
  "drained-acceptable": 40,
  "rebalanced-by-strategy": 0,
  "rebalanced-by-no-stickiness": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 320,
  perUnitMonthlyUsd: {
    [`${INSTANCE_COUNT_KEY}:4`]: 0,
    [`${INSTANCE_COUNT_KEY}:6`]: 160,
    [`${INSTANCE_COUNT_KEY}:8`]: 320,
    [`${INSTANCE_COUNT_KEY}:12`]: 640,
  },
};

/**
 * Full recovery: the imbalance mechanism itself was corrected
 * (imbalanceRootCause === "rebalanced" — either balancing strategy
 * switched away from sticky hashing, or sticky sessions disabled
 * outright) and every customer-facing metric is healthy. Gating on
 * imbalanceRootCause rather than only the numeric metrics is
 * deliberate: connection draining alone also drives
 * globalSuccessRatePct/instance latencies close to healthy, but that is
 * the acceptable tier below, not optimal — see acceptableCondition and
 * definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "sessionSurge", source: "trigger", operator: "equals", comparedTo: true },
    { key: "globalSuccessRatePct", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "balancerStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "imbalanceRootCause", operator: "equals", comparedTo: "rebalanced" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: connection draining forced existing pinned
 * connections to terminate and re-establish elsewhere. Every
 * customer-facing metric the candidate can see (success rate, instance
 * latencies, connection counts) is genuinely healthy, but this is
 * reached only because existing sessions were forcibly disconnected —
 * the sticky-hash mechanism that caused the skew is untouched and would
 * re-skew the moment traffic re-accumulates. See completion-mode audit
 * in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "sessionSurge", source: "trigger", operator: "equals", comparedTo: true },
    { key: "globalSuccessRatePct", operator: "greater_than_or_equal", comparedTo: 96 },
    { key: "balancerStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "instanceAConnectionCount", operator: "less_than_or_equal", comparedTo: 100 },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "globalSuccessRatePct", operator: "less_than_or_equal", comparedTo: 75 }],
  sustainedSeconds: 60,
};
