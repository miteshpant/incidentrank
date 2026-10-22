import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONSUMER_INSTANCES_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  lagging: 300,
  rebalancing: 500,
  "degraded-integrity": 50,
  degraded: 80,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 150,
  perUnitMonthlyUsd: {
    [`${CONSUMER_INSTANCES_KEY}:2`]: 0,
    [`${CONSUMER_INSTANCES_KEY}:4`]: 80,
    [`${CONSUMER_INSTANCES_KEY}:8`]: 220,
    [`${CONSUMER_INSTANCES_KEY}:16`]: 500,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "consumerLagMessages", operator: "less_than_or_equal", comparedTo: 300 },
    { key: "errorRate", operator: "less_than", comparedTo: 1 },
    { key: "consumerStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "consumerLagMessages", operator: "greater_than_or_equal", comparedTo: 7_500 }],
  sustainedSeconds: 60,
};
