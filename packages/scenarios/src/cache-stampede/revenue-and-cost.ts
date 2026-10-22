import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { ORIGIN_CONNECTION_POOL_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  stampeding: 450,
  "recurring-stampede": 600,
  "masked-stampede": 120,
  degraded: 150,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 120,
  perUnitMonthlyUsd: {
    [`${ORIGIN_CONNECTION_POOL_SIZE_KEY}:20`]: 0,
    [`${ORIGIN_CONNECTION_POOL_SIZE_KEY}:50`]: 70,
    [`${ORIGIN_CONNECTION_POOL_SIZE_KEY}:100`]: 180,
    [`${ORIGIN_CONNECTION_POOL_SIZE_KEY}:200`]: 420,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cacheHitRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "queuedRequests", operator: "less_than_or_equal", comparedTo: 10 },
    { key: "cacheStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "queuedRequests", operator: "greater_than_or_equal", comparedTo: 600 }],
  sustainedSeconds: 60,
};
