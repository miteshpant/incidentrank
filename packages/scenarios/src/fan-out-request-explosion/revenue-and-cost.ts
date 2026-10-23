import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { FAN_OUT_CONCURRENCY_LIMIT_KEY, RESPONSE_CACHE_ENABLED_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "concurrency-worsens-contention": 720,
  "core-path-broken": 680,
  "service-e-degraded": 600,
  "cache-partial-relief": 260,
  "batching-shifts-pressure": 160,
  "fan-out-widened": 40,
  "enrichment-excluded": 0,
  "partial-response-recovery": 0,
  "batching-cache-recovered": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 520,
  perUnitMonthlyUsd: {
    [`${FAN_OUT_CONCURRENCY_LIMIT_KEY}:20`]: -80,
    [`${FAN_OUT_CONCURRENCY_LIMIT_KEY}:50`]: 0,
    [`${FAN_OUT_CONCURRENCY_LIMIT_KEY}:100`]: 180,
    [`${FAN_OUT_CONCURRENCY_LIMIT_KEY}:200`]: 460,
    [`${RESPONSE_CACHE_ENABLED_KEY}:true`]: 90,
  },
};

/**
 * Full recovery: the core response path (pricing/inventory/shipping/tax)
 * is intact and the aggregator is healthy. Reachable via three genuinely
 * different strategies authored in rules.ts — excluding the optional
 * enrichment call outright, tolerating a missing enrichment result via a
 * short timeout + partial-response policy, or batching downstream calls
 * together with response caching to relieve both Service E and the
 * Service A pressure batching alone introduces. All three converge on the
 * same successCondition because, from the customer's perspective, they
 * are equally safe: the product response is complete and correct and the
 * aggregator is no longer waiting on a degraded dependency.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "aggregatorStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "corePathHealth", operator: "equals", comparedTo: "core-path-intact" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "customerSuccessRatePercent", operator: "less_than_or_equal", comparedTo: 45 },
  ],
  sustainedSeconds: 60,
};
