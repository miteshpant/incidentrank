import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { RETRY_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "retry-amplification": 900,
  "stale-endpoints": 500,
  "capacity-pinched": 260,
  "partially-recovering": 150,
  recovered: 0,
  "recovered-via-fallback": 0,
  "recovered-via-refresh": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 90,
  perUnitMonthlyUsd: {
    [`${RETRY_COUNT_KEY}:1`]: 0,
    [`${RETRY_COUNT_KEY}:3`]: 0,
    [`${RETRY_COUNT_KEY}:8`]: 50,
    [`${RETRY_COUNT_KEY}:20`]: 140,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "connectionFailuresPerMinute", operator: "less_than_or_equal", comparedTo: 15 },
    { key: "healthyEndpointCount", operator: "greater_than_or_equal", comparedTo: 7 },
    { key: "discoveryStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "connectionFailuresPerMinute", operator: "greater_than_or_equal", comparedTo: 600 },
  ],
  sustainedSeconds: 60,
};
