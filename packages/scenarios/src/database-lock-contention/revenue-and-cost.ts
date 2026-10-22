import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { BATCH_JOB_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  contending: 350,
  "severe-contention": 550,
  "masked-contention": 100,
  degraded: 90,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 100,
  perUnitMonthlyUsd: {
    [`${BATCH_JOB_CONCURRENCY_KEY}:1`]: 0,
    [`${BATCH_JOB_CONCURRENCY_KEY}:2`]: 20,
    [`${BATCH_JOB_CONCURRENCY_KEY}:4`]: 60,
    [`${BATCH_JOB_CONCURRENCY_KEY}:8`]: 160,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "blockedTransactions", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "timedOutTransactions", operator: "equals", comparedTo: 0 },
    { key: "lockStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "blockedTransactions", operator: "greater_than_or_equal", comparedTo: 150 }],
  sustainedSeconds: 60,
};
