import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { B_TO_C_RETRY_COUNT_KEY, SERVICE_A_CONCURRENCY_LIMIT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "retry-amplified": 900,
  "cascading-saturated": 880,
  cascading: 820,
  "fail-fast-wasted-work": 850,
  "bulkhead-partial": 400,
  "b-fixed-a-budget-misaligned": 320,
  "b-relieved-c-connections-stressed": 420,
  "breaker-open": 90,
  "recovered-budgeted": 15,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 350,
  perUnitMonthlyUsd: {
    [`${SERVICE_A_CONCURRENCY_LIMIT_KEY}:400`]: 0,
    [`${SERVICE_A_CONCURRENCY_LIMIT_KEY}:200`]: 0,
    [`${SERVICE_A_CONCURRENCY_LIMIT_KEY}:80`]: 0,
    [`${SERVICE_A_CONCURRENCY_LIMIT_KEY}:30`]: 0,
    [`${B_TO_C_RETRY_COUNT_KEY}:0`]: 0,
    [`${B_TO_C_RETRY_COUNT_KEY}:1`]: 0,
    [`${B_TO_C_RETRY_COUNT_KEY}:3`]: 120,
    [`${B_TO_C_RETRY_COUNT_KEY}:5`]: 260,
  },
};

/**
 * Full recovery: the timeout budget is correctly re-proportioned
 * end-to-end (timeoutBudgetHealth === "budgeted", set by rules.ts's
 * budget-reproportioned-recovery) and every customer-facing metric is
 * healthy — a genuine, durable fix that holds regardless of how long
 * Service C stays slow. Gating on timeoutBudgetHealth rather than only
 * the numeric metrics is deliberate: tripping the circuit breaker also
 * drives pool utilization down across the board, but that is the
 * acceptable tier below, not optimal — see this file's
 * acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 90 },
    { key: "chainStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "timeoutBudgetHealth", operator: "equals", comparedTo: "budgeted" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: the circuit breaker on the B->C hop is tripped
 * (timeoutBudgetHealth === "masked"). Every pool/latency metric upstream
 * of Service C recovers because nothing ever blocks on C again, but this
 * is reached only by fencing C off entirely, not by fixing the timeout
 * budget — the capability C provides stays unavailable while the breaker
 * is open. See completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 80 },
    { key: "chainStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "timeoutBudgetHealth", operator: "equals", comparedTo: "masked" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "less_than_or_equal", comparedTo: 10 },
  ],
  sustainedSeconds: 60,
};
