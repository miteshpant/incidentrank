import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { FORCE_LEADER_REELECTION_KEY, RESYNC_FLEET_CLOCKS_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  skewed: 700,
  "wide-skew": 1_100,
  degraded: 300,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${RESYNC_FLEET_CLOCKS_KEY}:true`]: 40,
    [`${FORCE_LEADER_REELECTION_KEY}:true`]: 10,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "lockServiceSplitBrainCount", operator: "equals", comparedTo: 0 },
    { key: "ledgerOutOfOrderWriteRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "rateLimiterFalseThrottleRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "fleetClockSkewMs", operator: "less_than_or_equal", comparedTo: 50 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "fleetClockSkewMs", operator: "greater_than_or_equal", comparedTo: 800 }],
  sustainedSeconds: 60,
};
