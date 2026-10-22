import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  throttled: 300,
  "escalating-violations": 500,
  degraded: 90,
  recovering: 0,
  healthy: 0,
};

// This scenario's controls are behavioral/software config rather than
// infrastructure scaling, so cost stays modest and flat — no
// perUnitMonthlyUsd entries, just a small realistic baseline.
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 60,
  perUnitMonthlyUsd: {},
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "rateLimitViolationRate", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "effectiveThroughput", operator: "greater_than_or_equal", comparedTo: 450 },
    { key: "rateLimitStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "rateLimitViolationRate", operator: "greater_than_or_equal", comparedTo: 40 }],
  sustainedSeconds: 60,
};
