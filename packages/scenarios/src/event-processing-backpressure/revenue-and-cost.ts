import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  CONSUMER_COUNT_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "external-rate-limited": 820,
  "both-overloaded": 760,
  "db-overloaded": 640,
  "external-api-overloaded": 600,
  "backlog-growing": 520,
  "throttled-still-stale": 260,
  "priority-routed-acceptable": 40,
  "balanced-recovery": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${CONSUMER_COUNT_KEY}:2`]: 0,
    [`${CONSUMER_COUNT_KEY}:4`]: 180,
    [`${CONSUMER_COUNT_KEY}:8`]: 420,
    [`${CONSUMER_COUNT_KEY}:16`]: 880,
    [`${WORKER_CONCURRENCY_KEY}:10`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:20`]: 90,
    [`${WORKER_CONCURRENCY_KEY}:40`]: 220,
    [`${WORKER_CONCURRENCY_KEY}:80`]: 480,
    [`${EXTERNAL_API_CALL_CONCURRENCY_KEY}:5`]: 0,
    [`${EXTERNAL_API_CALL_CONCURRENCY_KEY}:15`]: 0,
    [`${EXTERNAL_API_CALL_CONCURRENCY_KEY}:30`]: 60,
    [`${EXTERNAL_API_CALL_CONCURRENCY_KEY}:60`]: 160,
  },
};

/**
 * Full recovery: Kafka lag drained, event freshness low, AND
 * downstreamPressure === "balanced" — database and external-API pressure
 * were kept within bounds while the backlog was drained, not merely
 * pushed one hop downstream. Gating on downstreamPressure rather than
 * only the numeric metrics is deliberate: scaling consumers aggressively
 * also drains kafkaLagMessages, but that is exactly the harmful
 * pressure-transfer path (db-overloaded / external-api-overloaded),
 * which must never satisfy success just because the queue-depth number
 * looks good.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "kafkaLagMessages", operator: "less_than_or_equal", comparedTo: 50 },
    { key: "eventFreshnessSeconds", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "dbConnectionUtilization", operator: "less_than", comparedTo: 70 },
    { key: "externalApiErrorRate", operator: "less_than", comparedTo: 15 },
    { key: "downstreamPressure", operator: "equals", comparedTo: "balanced" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: the core/high-priority path and every subsystem
 * health signal the candidate can see (DB, external API) are genuinely
 * safe, reached via priority routing deliberately deferring low-priority
 * events rather than the backpressure being fully, optimally balanced —
 * see completion-mode audit in definition.ts.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "dbConnectionUtilization", operator: "less_than", comparedTo: 70 },
    { key: "externalApiErrorRate", operator: "less_than", comparedTo: 15 },
    { key: "downstreamPressure", operator: "equals", comparedTo: "low-priority-deferred" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "dbConnectionUtilization", operator: "greater_than_or_equal", comparedTo: 95 },
  ],
  sustainedSeconds: 60,
};
