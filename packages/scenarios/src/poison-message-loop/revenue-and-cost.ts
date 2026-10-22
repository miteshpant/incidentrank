import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONSUMER_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "poison-looping": 350,
  "retry-storm": 550,
  "lagging-dlq-unused": 300,
  degraded: 90,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 100,
  perUnitMonthlyUsd: {
    [`${CONSUMER_CONCURRENCY_KEY}:2`]: 0,
    [`${CONSUMER_CONCURRENCY_KEY}:4`]: 60,
    [`${CONSUMER_CONCURRENCY_KEY}:8`]: 160,
    [`${CONSUMER_CONCURRENCY_KEY}:16`]: 380,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "healthyMessageBacklog", operator: "less_than_or_equal", comparedTo: 20 },
    { key: "queueDepth", operator: "less_than_or_equal", comparedTo: 50 },
    { key: "queueStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "healthyMessageBacklog", operator: "greater_than_or_equal", comparedTo: 900 }],
  sustainedSeconds: 60,
};
