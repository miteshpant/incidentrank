import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONNECTION_POOL_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  regressed: 350,
  "contention-worsened": 550,
  "masked-regression": 120,
  degraded: 150,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 140,
  perUnitMonthlyUsd: {
    [`${CONNECTION_POOL_SIZE_KEY}:20`]: 0,
    [`${CONNECTION_POOL_SIZE_KEY}:50`]: 60,
    [`${CONNECTION_POOL_SIZE_KEY}:100`]: 160,
    [`${CONNECTION_POOL_SIZE_KEY}:200`]: 380,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "cpuUtilization", operator: "less_than_or_equal", comparedTo: 30 },
    { key: "queuedQueries", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "queryStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "cpuUtilization", operator: "greater_than_or_equal", comparedTo: 90 }],
  sustainedSeconds: 60,
};
