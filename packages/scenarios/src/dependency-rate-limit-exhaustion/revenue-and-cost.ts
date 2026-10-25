import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "retry-accelerated-exhaustion": 900,
  "provider-throttling": 520,
  "capped-concurrency-partial": 260,
  "quota-drawing-down": 60,
  "feature-suppressed": 40,
  "sustained-under-quota-caching": 0,
  "sustained-under-quota-priority": 10,
  healthy: 0,
};

// No control in this scenario carries a meaningful infrastructure cost
// delta of its own (caching/coalescing/priority policy/feature
// suppression/concurrency caps are configuration, not provisioned
// capacity) — baseline only, matching the scenario's real cost surface.
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {},
};

/**
 * Full recovery: call volume against the dependency has been durably
 * reduced below the quota's sustainable burn rate for the rest of the
 * rolling window (quotaOutcome === "sustained-under-quota") — caching +
 * coalescing, or priority-only traffic shedding. Gating on quotaOutcome
 * rather than only the numeric quota/success metrics is deliberate:
 * suppressing the optional feature also drives dependency429RatePerMin
 * to 0 and applicationSuccessRatePct to 100, but that is the acceptable
 * tier below, not optimal — see this file's acceptableCondition and
 * definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "quotaStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "dependency429RatePerMin", operator: "equals", comparedTo: 0 },
    { key: "quotaOutcome", operator: "equals", comparedTo: "sustained-under-quota" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: the optional enrichment feature has been
 * suppressed (quotaOutcome === "feature-suppressed"). Every
 * customer-visible quota/429/success metric is genuinely healthy, but
 * this is reached only because an entire feature was turned off, not
 * because the dependency's call volume was made durably sustainable —
 * see completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "quotaStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "dependency429RatePerMin", operator: "equals", comparedTo: 0 },
    { key: "quotaOutcome", operator: "equals", comparedTo: "feature-suppressed" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "quotaRemainingPct", operator: "less_than_or_equal", comparedTo: 0 }],
  sustainedSeconds: 60,
};
