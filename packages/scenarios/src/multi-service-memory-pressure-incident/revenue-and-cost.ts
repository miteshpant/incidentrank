import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  AGGREGATION_CONCURRENCY_KEY,
  API_CONCURRENCY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "oom-churn-active": 900,
  "unmitigated-spread": 620,
  "decoy-scaled-pressure-reaccumulated": 560,
  "worker-count-scaled-worsens-aggregator": 520,
  "api-concurrency-scaled-worsens-everything": 480,
  "truncation-correctness-violation": 420,
  "dependency-a-gc-thrashing": 300,
  "decoy-scaled-temporary-relief": 120,
  "cache-policy-partial-relief": 140,
  "partial-response-mode-active": 60,
  "shape-change-shipped": 30,
  "just-applied-field-set": 40,
  "decaying-field-set-window1": 20,
  "decaying-concurrency-window1": 20,
  "decaying-field-set-window2": 5,
  "decaying-concurrency-window2": 5,
  "fully-recovered-field-set": 0,
  "fully-recovered-concurrency": 0,
  "recovered-but-churn-scarred": 0,
  "recovered-but-churn-scarred-concurrency": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 640,
  perUnitMonthlyUsd: {
    [`${DEPENDENCY_A_INSTANCE_COUNT_KEY}:4`]: 120,
    [`${DEPENDENCY_A_INSTANCE_COUNT_KEY}:8`]: 340,
    [`${WORKER_COUNT_KEY}:16`]: 160,
    [`${WORKER_COUNT_KEY}:32`]: 420,
    [`${API_CONCURRENCY_KEY}:200`]: 90,
    [`${API_CONCURRENCY_KEY}:400`]: 260,
    [`${AGGREGATION_CONCURRENCY_KEY}:25`]: -40,
    [`${AGGREGATION_CONCURRENCY_KEY}:10`]: -90,
  },
};

/**
 * Full recovery: the Aggregator's own oversized per-request object has
 * genuinely been reduced (either by field-set truncation at the source
 * or by lowering aggregation concurrency), AND the GC/heap decay window
 * has fully elapsed, AND no correctness-bound violation (truncation) is
 * active. Reachable via either of rules.ts's two structurally different
 * root-cause fixes — both converge here because, from the customer's
 * perspective and the fleet's own stability, they are equally durable:
 * memoryPressureHealth reaches "clear" only once decay has genuinely
 * finished, never on the same tick a fix is applied.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "memoryPressureHealth", operator: "equals", comparedTo: "clear" },
    { key: "customerEnrichmentCompletenessPct", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "aggregatorStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable tier: partialResponseMode protects the fleet from OOM/
 * restart churn (the binding invariant "the service fleet must not
 * enter restart/OOM churn") even though the upstream root cause remains
 * unaddressed and enrichment completeness is reduced — a deliberate,
 * bounded, genuinely-safe-but-imperfect tradeoff distinct from the full
 * successCondition. See completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "rootCauseHealth", operator: "equals", comparedTo: "unaddressed" },
    { key: "customerEnrichmentCompletenessPct", operator: "greater_than_or_equal", comparedTo: 85 },
    { key: "customerEnrichmentCompletenessPct", operator: "less_than", comparedTo: 95 },
    { key: "aggregatorStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "errorRatePct", operator: "less_than", comparedTo: 5 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "aggregatorMemoryUtilizationPct", operator: "greater_than_or_equal", comparedTo: 96 }],
  sustainedSeconds: 60,
};
