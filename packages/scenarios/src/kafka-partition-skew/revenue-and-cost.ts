import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONSUMER_INSTANCES_KEY, PARTITION_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  skewed: 350,
  "wasted-scaling": 400,
  degraded: 120,
  "recovered-ordering-risk": 20,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 100,
  perUnitMonthlyUsd: {
    [`${CONSUMER_INSTANCES_KEY}:2`]: 0,
    [`${CONSUMER_INSTANCES_KEY}:4`]: 60,
    [`${CONSUMER_INSTANCES_KEY}:8`]: 160,
    [`${CONSUMER_INSTANCES_KEY}:16`]: 380,
    [`${PARTITION_COUNT_KEY}:4`]: 0,
    [`${PARTITION_COUNT_KEY}:8`]: 30,
    [`${PARTITION_COUNT_KEY}:16`]: 70,
    [`${PARTITION_COUNT_KEY}:32`]: 150,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "hotPartitionLagMessages", operator: "less_than_or_equal", comparedTo: 300 },
    { key: "partitionStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "hotPartitionLagMessages", operator: "greater_than_or_equal", comparedTo: 6_000 },
  ],
  sustainedSeconds: 60,
};
