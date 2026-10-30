import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { REDIS_CONNECTION_POOL_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  contending: 600,
  degraded: 250,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 400,
  perUnitMonthlyUsd: {
    [`${REDIS_CONNECTION_POOL_KEY}:128`]: 0,
    [`${REDIS_CONNECTION_POOL_KEY}:256`]: 60,
    [`${REDIS_CONNECTION_POOL_KEY}:512`]: 150,
    [`${REDIS_CONNECTION_POOL_KEY}:1024`]: 340,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "paymentRetryRatePercent", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "inventoryP95LatencyMs", operator: "less_than_or_equal", comparedTo: 200 },
    { key: "redisConnectionUtilizationPercent", operator: "less_than", comparedTo: 50 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "redisConnectionUtilizationPercent", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
