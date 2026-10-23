import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_CONCURRENCY_KEY, CACHE_MEMORY_MULTIPLIER_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "db-read-pressure-critical": 700,
  "scaled-concurrency-worsened": 680,
  "ttl-lowered-worsened": 560,
  "eviction-churn-critical": 420,
  "db-shielded-cache-still-thrashing": 180,
  "memory-scaled-moderate-partial": 160,
  "memory-scaled-partial": 90,
  "policy-fixed-recovered": 0,
  "admission-fixed-recovered": 0,
  "object-policy-fixed-recovered": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${CACHE_MEMORY_MULTIPLIER_KEY}:1`]: 0,
    [`${CACHE_MEMORY_MULTIPLIER_KEY}:2`]: 140,
    [`${CACHE_MEMORY_MULTIPLIER_KEY}:4`]: 340,
    [`${CACHE_MEMORY_MULTIPLIER_KEY}:8`]: 780,
    [`${API_CONCURRENCY_KEY}:low`]: 0,
    [`${API_CONCURRENCY_KEY}:medium`]: 0,
    [`${API_CONCURRENCY_KEY}:high`]: 260,
  },
};

/**
 * Full recovery: a genuine caching/admission policy fix is in place
 * (cacheRecoveryMode === "policyFixed", set by rules.ts for every one of
 * the three policy-fix rule variants) and every customer-facing metric
 * is healthy. Gating on cacheRecoveryMode rather than only the numeric
 * metrics is deliberate: raising the memory multiplier alone also
 * improves hitRatioPct/evictionRatePerSec, but never enough to cross this
 * bar (see completion-mode audit in definition.ts) — and even if it did,
 * the scenario's required distinction is that memory alone is not the
 * real fix, which this gate makes structurally impossible to satisfy by
 * accident.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cacheStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "cacheStatus", operator: "not_equals", comparedTo: "warning" },
    { key: "hitRatioPct", operator: "greater_than_or_equal", comparedTo: 90 },
    { key: "cacheRecoveryMode", operator: "equals", comparedTo: "policyFixed" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "hitRatioPct", operator: "less_than_or_equal", comparedTo: 20 }],
  sustainedSeconds: 60,
};
