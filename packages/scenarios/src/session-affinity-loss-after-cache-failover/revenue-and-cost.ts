import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { SCALE_CACHE_CLUSTER_KEY } from "./controls";

// This is a correctness incident, not an availability one — revenue loss
// is driven by the fraction of logged-in users hitting an inconsistent
// session (abandoned carts, re-auth friction), not by raw latency/error
// rate, which barely move. "broken"/"degraded" both lose real revenue;
// "recovering" and "healthy" lose none.
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  broken: 420,
  degraded: 180,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 350,
  perUnitMonthlyUsd: {
    [`${SCALE_CACHE_CLUSTER_KEY}:3`]: 0,
    [`${SCALE_CACHE_CLUSTER_KEY}:6`]: 140,
    [`${SCALE_CACHE_CLUSTER_KEY}:9`]: 280,
    [`${SCALE_CACHE_CLUSTER_KEY}:12`]: 420,
  },
};

// Success is defined entirely in terms of session correctness, not raw
// service health — request latency/error rate are deliberately absent
// from this condition because they were never the signal that mattered.
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "sessionAffinityMismatchRatePercent", operator: "less_than_or_equal", comparedTo: 2 },
    { key: "sessionStateInconsistencyRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "unexpectedLogoutRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "sessionStateInconsistencyRatePercent", operator: "greater_than_or_equal", comparedTo: 20 },
  ],
  sustainedSeconds: 60,
};
