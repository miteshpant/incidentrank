import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { FALLBACK_RESPONSE_ENABLED_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  exhausting: 400,
  degraded: 120,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 90,
  perUnitMonthlyUsd: {
    [`${FALLBACK_RESPONSE_ENABLED_KEY}:true`]: 40,
    [`${FALLBACK_RESPONSE_ENABLED_KEY}:false`]: 0,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "callingServiceThreadPoolUtilization", operator: "less_than_or_equal", comparedTo: 40 },
    { key: "failedRequestRate", operator: "less_than", comparedTo: 5 },
    { key: "callingServiceStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "queuedRequests", operator: "greater_than_or_equal", comparedTo: 400 }],
  sustainedSeconds: 60,
};
