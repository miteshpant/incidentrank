import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { SERVICE_C_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "amplification-worsened": 640,
  "second-wave-critical": 560,
  "baseline-critical": 420,
  "timeout-tuned-no-ownership": 430,
  "single-layer-relief-incomplete": 260,
  "owned-no-breaker": 60,
  "owned-zombie-work-persists": 20,
  "owned-fully-safe": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 600,
  perUnitMonthlyUsd: {
    [`${SERVICE_C_CONCURRENCY_KEY}:50`]: -80,
    [`${SERVICE_C_CONCURRENCY_KEY}:100`]: 0,
    [`${SERVICE_C_CONCURRENCY_KEY}:200`]: 0,
    [`${SERVICE_C_CONCURRENCY_KEY}:400`]: 350,
  },
};

/**
 * Full recovery: retries consolidated at exactly one layer (Service C,
 * the layer directly adjacent to the provider), amplification bounded
 * (effectiveAmplificationFactor <= 3, i.e. upstream layers contribute
 * no multiplicative retrying at all), the circuit breaker protecting
 * the provider, and cancellation propagation preventing zombie work
 * from accumulating. retryOwnershipMode === "owned-service-c" is the
 * single field that distinguishes a genuinely-fixed topology from a
 * low-numbers coincidence.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "retryOwnershipMode", operator: "equals", comparedTo: "owned-service-c" },
    { key: "effectiveAmplificationFactor", operator: "less_than_or_equal", comparedTo: 3 },
    { key: "zombieRequestCount", operator: "less_than_or_equal", comparedTo: 20 },
    { key: "customerSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable: ownership is correctly consolidated at Service C
 * (amplification bounded) but one of the two secondary safeguards
 * (breaker or cancellation propagation) has not yet been applied, so a
 * bounded amount of zombie work or unprotected provider-facing retry
 * traffic continues. A genuine, deliberate, bounded-risk handback state
 * — the dominant amplification mechanism is solved — but not the fully
 * clean state.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "retryOwnershipMode", operator: "equals", comparedTo: "owned-service-c" },
    { key: "effectiveAmplificationFactor", operator: "less_than_or_equal", comparedTo: 3 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: in-flight request pressure has grown large enough, for long
 * enough, that the chain's own capacity is being consumed by retried/
 * zombie work rather than genuine customer traffic — the reachable
 * ceiling on the unmitigated and multi-layer-retry-increase paths.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "inFlightRequests", operator: "greater_than_or_equal", comparedTo: 15_000 }],
  sustainedSeconds: 60,
};
