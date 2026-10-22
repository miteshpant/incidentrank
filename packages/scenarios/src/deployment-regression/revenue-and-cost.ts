import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  regressing: 400,
  // Distinct from "regressing": the harmful trap (debug logging left on,
  // full traffic still on the regressed version) doesn't just fail to
  // help — the extra logging overhead measurably compounds latency/error
  // impact under load, so it must accrue revenue loss faster than inaction,
  // not at the identical rate (see rules.ts's
  // debug-logging-without-rollback-harmful).
  "regressing-harmful": 900,
  degraded: 80,
  recovering: 0,
  healthy: 0,
};

// Deploy/traffic-routing config, not infrastructure scaling — keep cost
// modest and flat rather than inventing a scaling-cost lever that doesn't
// exist for these controls.
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 120,
  perUnitMonthlyUsd: {},
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "errorRate", operator: "less_than", comparedTo: 1 },
    { key: "deployStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 7 }],
  sustainedSeconds: 60,
};
