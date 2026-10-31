import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  woken: 400,
  degraded: 180,
  recovering: 0,
  healthy: 0,
};

// No control in this scenario changes infrastructure spend — the fix is a
// flag flip, not a capacity change — so every unit is free. costEfficiency
// still scores meaningfully off costIncreaseRatio (it stays 0 for every
// candidate, rewarding everyone equally rather than penalizing anyone for
// a dimension this incident never actually exercises).
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 150,
  perUnitMonthlyUsd: {},
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "priceMismatchRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "legacyPricingEngineTrafficSharePercent", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "priceMismatchRatePercent", operator: "greater_than_or_equal", comparedTo: 20 }],
  sustainedSeconds: 90,
};
