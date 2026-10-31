import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  flapping: 400,
  "flapping-pinned": 60,
  "partially-damped": 180,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 250,
  perUnitMonthlyUsd: {
    [`${HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY}:1`]: 0,
    [`${HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY}:2`]: 10,
    [`${HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY}:3`]: 20,
    [`${HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY}:5`]: 35,
    [`${HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY}:150`]: 0,
    [`${HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY}:300`]: 5,
    [`${HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY}:600`]: 10,
    [`${HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY}:1200`]: 15,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "dnsFailoverFlapCount", operator: "less_than_or_equal", comparedTo: 2 },
    { key: "clientConnectionResetRatePercent", operator: "less_than", comparedTo: 1 },
    { key: "clientErrorRatePercent", operator: "less_than", comparedTo: 1 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "clientConnectionResetRatePercent", operator: "greater_than_or_equal", comparedTo: 20 }],
  sustainedSeconds: 60,
};
