import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { JOB_WORKER_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  overlapping: 420,
  degraded: 180,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 260,
  perUnitMonthlyUsd: {
    [`${JOB_WORKER_COUNT_KEY}:4`]: 0,
    [`${JOB_WORKER_COUNT_KEY}:8`]: 90,
    [`${JOB_WORKER_COUNT_KEY}:16`]: 210,
    [`${JOB_WORKER_COUNT_KEY}:32`]: 480,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "concurrentRunCount", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "dailyMetricsDuplicateRowPercent", operator: "less_than_or_equal", comparedTo: 8 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "dailyMetricsDuplicateRowPercent", operator: "greater_than_or_equal", comparedTo: 40 }],
  sustainedSeconds: 60,
};
