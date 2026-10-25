import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { DISPATCHER_CONCURRENCY_KEY, WORKER_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "dlq-escalation-blast-radius": 900,
  "scaled-concurrency-blast-radius": 820,
  "unbounded-retries-blast-radius": 800,
  "scaled-workers-blast-radius": 780,
  "blast-radius-baseline": 560,
  "dlq-threshold-partial-relief": 300,
  "backoff-partial-relief": 180,
  "isolated-dlq-growing": 40,
  "isolated-recovery": 20,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 260,
  perUnitMonthlyUsd: {
    [`${DISPATCHER_CONCURRENCY_KEY}:100`]: 0,
    [`${DISPATCHER_CONCURRENCY_KEY}:200`]: 140,
    [`${DISPATCHER_CONCURRENCY_KEY}:400`]: 360,
    [`${WORKER_COUNT_KEY}:8`]: 80,
    [`${WORKER_COUNT_KEY}:16`]: 220,
    [`${WORKER_COUNT_KEY}:32`]: 520,
  },
};

/**
 * Full recovery: destination isolation is live
 * (deliveryIsolationState === "isolated") and healthy-destination
 * delivery latency has returned to (approximately) its pre-incident
 * baseline — the real structural fix. Gating on deliveryIsolationState
 * rather than only the numeric latency is deliberate: several
 * mitigations below (backoff, DLQ threshold) also pull
 * healthyDestinationDeliveryLatencyMs down somewhat, but none of them
 * stop the failing subset's retries from sharing the pool the way
 * isolation does — see rules.ts and definition.ts's completion-mode
 * audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "healthyDestinationDeliveryLatencyMs", operator: "less_than_or_equal", comparedTo: 250 },
    { key: "dispatcherStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "deliveryIsolationState", operator: "equals", comparedTo: "isolated" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "dispatcherWorkerUtilization", operator: "greater_than_or_equal", comparedTo: 99 }],
  sustainedSeconds: 60,
};
