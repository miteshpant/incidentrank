import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { WORKER_COUNT_KEY } from "./controls";

// Async processing delay — not live customer-facing checkout failure — is
// the revenue-loss driver here: a growing queue means fulfillment/
// notification/webhook-style side effects fall further and further behind,
// not that any customer-facing page is throwing errors in real time. Rates
// are accordingly lower per state than a synchronous scenario's, but scale
// with how backed-up the queue is.
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "retry-storm": 420,
  "retry-storm-escalated": 600,
  "retry-storm-building": 260,
  "lagging-dlq-unused": 220,
  "redelivery-loop": 140,
  "flapping-breaker": 90,
  recovering: 0,
  "recovering-breaker": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 120,
  perUnitMonthlyUsd: {
    [`${WORKER_COUNT_KEY}:2`]: 0,
    [`${WORKER_COUNT_KEY}:4`]: 0,
    [`${WORKER_COUNT_KEY}:8`]: 140,
    [`${WORKER_COUNT_KEY}:16`]: 340,
  },
};

export const successCondition: SuccessCondition = {
  conditions: [
    { key: "queueDepth", operator: "less_than_or_equal", comparedTo: 300 },
    { key: "retryRatePerMinute", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "queueHealth", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "queueDepth", operator: "greater_than_or_equal", comparedTo: 15_000 }],
  sustainedSeconds: 60,
};
