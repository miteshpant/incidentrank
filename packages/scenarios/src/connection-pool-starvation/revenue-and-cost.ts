import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { DB_POOL_MAX_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  starving: 550,
  degraded: 200,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 350,
  perUnitMonthlyUsd: {
    [`${DB_POOL_MAX_SIZE_KEY}:10`]: 0,
    [`${DB_POOL_MAX_SIZE_KEY}:25`]: 20,
    [`${DB_POOL_MAX_SIZE_KEY}:50`]: 45,
    [`${DB_POOL_MAX_SIZE_KEY}:100`]: 90,
    [`${DB_POOL_MAX_SIZE_KEY}:200`]: 210,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "requestErrorRate", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "requestLatencyMs", operator: "less_than_or_equal", comparedTo: 200 },
    { key: "poolUtilizationPercent", operator: "less_than", comparedTo: 50 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "poolUtilizationPercent", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
