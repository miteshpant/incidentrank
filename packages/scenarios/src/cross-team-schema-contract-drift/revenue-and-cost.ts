import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  drifting: 420,
  "analytics-still-broken": 90,
  "fraud-still-broken": 60,
  "only-loud-pipeline-fixed": 260,
  "fraud-restart-relapsing": 420,
  "shim-only": 260,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 900,
  perUnitMonthlyUsd: {},
};

// Recovery requires every one of the three independently-owned
// consumers to be clean simultaneously — a schema violation rate of 0
// alone (the producer-side shim) is NOT enough, matching the rule
// table's "shim-only" trap where new events stop violating the contract
// but every consumer's own backlog/corruption is still unresolved.
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "schemaViolationRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "billingDroppedEventCount", operator: "less_than_or_equal", comparedTo: 340 },
    { key: "analyticsCorruptedRowPercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "fraudConsumerLagSeconds", operator: "less_than_or_equal", comparedTo: 15 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "analyticsCorruptedRowPercent", operator: "greater_than_or_equal", comparedTo: 70 },
  ],
  sustainedSeconds: 90,
};
