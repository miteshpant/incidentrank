import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { GATEWAY_RETRY_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "retry-multiplied": 980,
  saturated: 960,
  accumulating: 860,
  "inner-hop-fixed-alone": 780,
  "cancellation-on-budget-misaligned": 560,
  "budgeted-but-accumulating": 480,
  fenced: 90,
  "recovered-rebudgeted": 15,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 380,
  perUnitMonthlyUsd: {
    [`${GATEWAY_RETRY_COUNT_KEY}:0`]: 0,
    [`${GATEWAY_RETRY_COUNT_KEY}:1`]: 0,
    [`${GATEWAY_RETRY_COUNT_KEY}:2`]: 90,
    [`${GATEWAY_RETRY_COUNT_KEY}:4`]: 240,
  },
};

/**
 * Full recovery: the timeout budget is correctly re-proportioned
 * end-to-end AND cancellation is enabled (timeoutBudgetHealth ===
 * "rebudgeted", set by rules.ts's budget-and-cancellation-recovery) and
 * every customer-facing metric is healthy — a genuine, durable fix that
 * holds regardless of how long the Dependency's blip persists. Gating on
 * timeoutBudgetHealth rather than only the numeric metrics is deliberate:
 * tripping the circuit breaker also drives in-flight/connection metrics
 * down, but that is the acceptable tier below, not optimal — see this
 * file's acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 90 },
    { key: "chainStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "timeoutBudgetHealth", operator: "equals", comparedTo: "rebudgeted" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: the circuit breaker on the B->Dependency hop is
 * tripped (timeoutBudgetHealth === "fenced"). Every pool/latency metric
 * upstream of the Dependency recovers because nothing ever blocks on it
 * again, but this is reached only by fencing the Dependency off
 * entirely, not by re-proportioning the timeout budget — the capability
 * the Dependency provides stays unavailable while the breaker is open.
 * See completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 80 },
    { key: "chainStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "timeoutBudgetHealth", operator: "equals", comparedTo: "fenced" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "less_than_or_equal", comparedTo: 10 },
  ],
  sustainedSeconds: 60,
};
