import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_GATEWAY_INSTANCES_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  overwhelmed: 700,
  "masked-recurring": 150,
  degraded: 250,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${API_GATEWAY_INSTANCES_KEY}:4`]: 0,
    [`${API_GATEWAY_INSTANCES_KEY}:8`]: 150,
    [`${API_GATEWAY_INSTANCES_KEY}:16`]: 420,
    [`${API_GATEWAY_INSTANCES_KEY}:32`]: 980,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "gatewayErrorRate", operator: "less_than", comparedTo: 1 },
    { key: "rejectedRequestCount", operator: "less_than_or_equal", comparedTo: 10 },
    { key: "gatewayStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "rejectedRequestCount", operator: "greater_than_or_equal", comparedTo: 700 }],
  sustainedSeconds: 60,
};
