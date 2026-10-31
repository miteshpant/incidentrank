import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { COMPACTION_LEVEL_MULTIPLIER_KEY, SCALE_UP_DISK_IOPS_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  saturated: 550,
  degraded: 220,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 900,
  perUnitMonthlyUsd: {
    [`${COMPACTION_LEVEL_MULTIPLIER_KEY}:2`]: 0,
    [`${COMPACTION_LEVEL_MULTIPLIER_KEY}:4`]: 0,
    [`${COMPACTION_LEVEL_MULTIPLIER_KEY}:8`]: 0,
    [`${COMPACTION_LEVEL_MULTIPLIER_KEY}:10`]: 0,
    [`${SCALE_UP_DISK_IOPS_KEY}:true`]: 650,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "writeAmplificationFactor", operator: "less_than_or_equal", comparedTo: 3.5 },
    { key: "diskIopsUtilizationPercent", operator: "less_than", comparedTo: 50 },
    { key: "writeErrorRate", operator: "less_than_or_equal", comparedTo: 0.2 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "diskIopsUtilizationPercent", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
