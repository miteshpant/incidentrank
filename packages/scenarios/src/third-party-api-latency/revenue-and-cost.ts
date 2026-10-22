import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CACHED_RESPONSE_FALLBACK_ENABLED_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "degraded-checkout": 400,
  "capacity-exhausted": 550,
  degraded: 120,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 80,
  perUnitMonthlyUsd: {
    [`${CACHED_RESPONSE_FALLBACK_ENABLED_KEY}:true`]: 40,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutServiceThreadPoolUtilization", operator: "less_than_or_equal", comparedTo: 35 },
    { key: "checkoutAbandonmentRate", operator: "less_than", comparedTo: 6 },
    { key: "checkoutStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "checkoutServiceThreadPoolUtilization", operator: "greater_than_or_equal", comparedTo: 80 },
  ],
  sustainedSeconds: 60,
};
