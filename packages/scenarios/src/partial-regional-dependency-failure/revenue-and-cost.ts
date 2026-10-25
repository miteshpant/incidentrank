import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "global-breaker-no-fallback": 2_400,
  "apac-worsened": 1_300,
  "regional-divergence": 760,
  "tight-timeout-tradeoff": 620,
  "eu-only-fixed": 480,
  "apac-only-fixed": 300,
  "global-breaker-tripped": 140,
  "regional-scoped-recovery": 25,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 900,
  perUnitMonthlyUsd: {},
};

/**
 * Full recovery: every region's dependency health is at worst "warning"
 * (no region is actively failing), the global blended success rate has
 * returned to a healthy level, AND the mitigation was applied region by
 * region (mitigationApproach === "regional") — meaning the one genuinely
 * healthy region (US) paid no unnecessary cost. Gating on
 * mitigationApproach rather than only the numeric thresholds is
 * deliberate: the global-circuit-breaker path below can ALSO drive
 * globalCustomerSuccessRate above a naive "good enough" bar, but it does
 * so only by sacrificing US's full service — that is the acceptable
 * tier, not optimal, per this scenario's required judgment.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "globalCustomerSuccessRate", operator: "greater_than_or_equal", comparedTo: 97.5 },
    { key: "usDependencyHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "euDependencyHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "apacDependencyHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "mitigationApproach", operator: "equals", comparedTo: "regional" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: the global circuit breaker was tripped
 * (mitigationApproach === "global"). Every region, including US, is
 * stable on the fallback path — nothing is actively failing, so this is
 * genuinely safe to hand back — but the healthy US region was forced
 * off live calls it never needed to leave, which is why this is the
 * deliberate-bounded-tradeoff acceptable tier, not optimal. See
 * definition.ts's completion-mode audit.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "globalCustomerSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "usDependencyHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "euDependencyHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "apacDependencyHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "mitigationApproach", operator: "equals", comparedTo: "global" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "globalCustomerSuccessRate", operator: "less_than_or_equal", comparedTo: 45 },
  ],
  sustainedSeconds: 60,
};
