import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { MAX_INSTANCE_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  overwhelmed: 400,
  capped: 450,
  degraded: 100,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 200,
  perUnitMonthlyUsd: {
    [`${MAX_INSTANCE_COUNT_KEY}:4`]: 0,
    [`${MAX_INSTANCE_COUNT_KEY}:8`]: 150,
    [`${MAX_INSTANCE_COUNT_KEY}:16`]: 450,
    [`${MAX_INSTANCE_COUNT_KEY}:32`]: 1_100,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cpuUtilizationPercent", operator: "less_than_or_equal", comparedTo: 70 },
    { key: "errorRate", operator: "less_than", comparedTo: 1 },
    { key: "capacityStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "cpuUtilizationPercent", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
