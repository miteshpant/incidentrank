import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_SERVICE_INSTANCES_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "config-broken": 700,
  "config-wasted-capacity": 700,
  "config-frozen-unresolved": 680,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 150,
  perUnitMonthlyUsd: {
    [`${API_SERVICE_INSTANCES_KEY}:2`]: 0,
    [`${API_SERVICE_INSTANCES_KEY}:4`]: 100,
    [`${API_SERVICE_INSTANCES_KEY}:8`]: 280,
    [`${API_SERVICE_INSTANCES_KEY}:16`]: 620,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "requestRejectionRate", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "configStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 10,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "requestRejectionRate", operator: "greater_than_or_equal", comparedTo: 50 }],
  sustainedSeconds: 60,
};
