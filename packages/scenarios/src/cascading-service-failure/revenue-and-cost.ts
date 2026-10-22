import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { REQUEST_QUEUE_DEPTH_LIMIT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  cascading: 600,
  "wide-cascade": 900,
  "wasted-restart": 700,
  recovering: 50,
  degraded: 300,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 180,
  perUnitMonthlyUsd: {
    [`${REQUEST_QUEUE_DEPTH_LIMIT_KEY}:50`]: 0,
    [`${REQUEST_QUEUE_DEPTH_LIMIT_KEY}:200`]: 20,
    [`${REQUEST_QUEUE_DEPTH_LIMIT_KEY}:1000`]: 60,
    [`${REQUEST_QUEUE_DEPTH_LIMIT_KEY}:5000`]: 150,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "checkoutSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "cascadeDepth", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "chainStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "checkoutSuccessRate", operator: "less_than_or_equal", comparedTo: 60 }],
  sustainedSeconds: 60,
};
