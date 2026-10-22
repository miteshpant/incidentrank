import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "rebalance-storm": 350,
  "rebalance-storm-worsened": 600,
  degraded: 80,
  recovering: 0,
  healthy: 0,
};

/**
 * No control here has a natural scaling-cost dimension — this scenario's
 * levers are deploy/coordinator behavior, not infrastructure sizing — so
 * infrastructureCost stays flat (a modest fixed baseline, no
 * perUnitMonthlyUsd entries), unlike scenarios whose fix involves scaling
 * instances or connection pools.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 120,
  perUnitMonthlyUsd: {},
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "groupStableTimeRatio", operator: "greater_than_or_equal", comparedTo: 90 },
    { key: "effectiveThroughput", operator: "greater_than_or_equal", comparedTo: 3_000 },
    { key: "groupStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "effectiveThroughput", operator: "less_than_or_equal", comparedTo: 1_000 }],
  sustainedSeconds: 60,
};
