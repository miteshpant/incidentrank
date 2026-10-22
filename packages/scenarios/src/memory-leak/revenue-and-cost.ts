import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  leaking: 280,
  "leak-recurred-critical": 400,
  "restarted-temporary": 0,
  degraded: 60,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 80,
  perUnitMonthlyUsd: {
    [`${MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY}:true`]: 15,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "memoryUsageMb", operator: "less_than_or_equal", comparedTo: 500 },
    { key: "errorRate", operator: "less_than", comparedTo: 1 },
    { key: "serviceStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "memoryUsageMb", operator: "greater_than_or_equal", comparedTo: 2_000 }],
  sustainedSeconds: 60,
};
