import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  lagging: 350,
  "primary-overloaded": 550,
  "masked-lag": 100,
  degraded: 120,
  recovering: 0,
  healthy: 0,
};

// This scenario's controls (routing mode, batch size, write throttling)
// are operational toggles, not infrastructure scaling — there is no
// legitimate per-control-value cost signal to author, so costEfficiency
// scores purely on the fixed baseline (no candidate action can increase
// monthly cost here, same as a scenario with no scaling lever at all).
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 180,
  perUnitMonthlyUsd: {},
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "replicationLagMs", operator: "less_than_or_equal", comparedTo: 500 },
    { key: "staleReadRate", operator: "less_than", comparedTo: 2 },
    { key: "replicaStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "replicationLagMs", operator: "greater_than_or_equal", comparedTo: 7_000 }],
  sustainedSeconds: 60,
};
