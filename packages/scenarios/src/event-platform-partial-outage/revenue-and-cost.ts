import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { BATCH_SIZE_KEY, CONSUMER_B_CONCURRENCY_KEY, DOWNSTREAM_CIRCUIT_BREAKER_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "broker-degraded-only": 120,
  "broker-and-consumer-b-active": 260,
  "all-three-unmitigated": 650,
  // Masked, not fixed: Consumer Group B's lag and Consumer Group C's
  // retry storm against the downstream are completely unaddressed by a
  // producer-side lever, so revenue loss stays close to (not below)
  // the real unmitigated baseline despite the calmer-looking broker
  // dashboard — never scored as an improvement.
  "producer-backpressure-masked": 620,
  "topic-a-contaminated-active": 1_400,
  "pressure-transferred-downstream": 900,
  "bounded-retries-events-discarded": 700,
  "broker-and-consumer-b-outstanding": 420,
  "consumer-b-outstanding": 260,
  "all-mitigated-draining": 90,
  "all-mitigated-recovered": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 400,
  perUnitMonthlyUsd: {
    [`${CONSUMER_B_CONCURRENCY_KEY}:4`]: 60,
    [`${CONSUMER_B_CONCURRENCY_KEY}:8`]: 150,
    [`${CONSUMER_B_CONCURRENCY_KEY}:16`]: 340,
    [`${DOWNSTREAM_CIRCUIT_BREAKER_KEY}:true`]: 20,
    [`${BATCH_SIZE_KEY}:2000`]: 10,
  },
};

/**
 * Full recovery (OPTIMAL): broker partition health fully restored,
 * Topic A durability at 100 with zero live drops, Consumer Group B's
 * lag fully drained, and the downstream DB/API's health fully
 * restored. Only reachable via all three real elapsed recovery windows
 * having fired AND the correct control combination held throughout —
 * see rules.ts's "all-mitigated-fully-recovered".
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "brokerPartitionHealth", operator: "greater_than_or_equal", comparedTo: 95 },
    { key: "topicADurabilityPct", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "consumerBLagMessages", operator: "less_than_or_equal", comparedTo: 100 },
    { key: "downstreamHealthPct", operator: "greater_than_or_equal", comparedTo: 90 },
  ],
  sustainedSeconds: 20,
};

/**
 * Acceptable handback: all three root causes have been correctly,
 * independently mitigated — new damage has genuinely stopped and Topic
 * A was never contaminated — but the recovery windows have not all
 * elapsed yet, so backlog/lag/downstream health are bounded and
 * draining rather than fully restored. See rules.ts's
 * "all-mitigated-draining".
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "brokerPartitionHealth", operator: "greater_than_or_equal", comparedTo: 70 },
    { key: "topicADurabilityPct", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "consumerBLagMessages", operator: "less_than_or_equal", comparedTo: 1_500 },
    { key: "downstreamHealthPct", operator: "greater_than_or_equal", comparedTo: 60 },
  ],
  sustainedSeconds: 20,
};

/**
 * Failure: Topic A durability has collapsed far enough, for long
 * enough, that the durability-critical invariant has been definitively
 * broken, not merely dipped — a genuine, automatic collapse condition
 * independent of completion mode.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "topicADurabilityPct", operator: "less_than_or_equal", comparedTo: 50 }],
  sustainedSeconds: 45,
};
