import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { WORKER_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  critical: 500,
  degraded: 180,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${WORKER_CONCURRENCY_KEY}:4`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:8`]: 40,
    [`${WORKER_CONCURRENCY_KEY}:16`]: 110,
    [`${WORKER_CONCURRENCY_KEY}:32`]: 260,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "activeConsumerCount", operator: "greater_than_or_equal", comparedTo: 12 },
    { key: "queueDepth", operator: "less_than_or_equal", comparedTo: 600 },
    { key: "notificationDeliveryDelaySeconds", operator: "less_than_or_equal", comparedTo: 30 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "queueDepth", operator: "greater_than_or_equal", comparedTo: 10_000 }],
  sustainedSeconds: 60,
};
