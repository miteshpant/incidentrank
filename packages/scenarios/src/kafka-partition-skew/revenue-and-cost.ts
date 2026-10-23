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
    // Phase 6.1: the optimal tier is specifically the salted-key fix,
    // which preserves per-tenant ordering. Round-robin fully clears the
    // throughput/lag bars too but sacrifices ordering — that's the
    // acceptableCondition tier below, not optimal.
    { key: "orderingMode", operator: "equals", comparedTo: "preserved" },
  ],
  sustainedSeconds: 15,
};

/**
 * Phase 6.1 candidate_declared acceptable tier: round-robin keying is a
 * genuine, bounded engineering tradeoff — it fully clears the same
 * throughput/lag/status bars as the optimal salted-key fix, but sets
 * orderingMode="degraded" (per-tenant ordering is no longer guaranteed).
 * This is a real accepted risk, not a disguised unsafe state — see
 * rules.ts's round-robin-recovers-with-ordering-tradeoff.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "hotPartitionLagMessages", operator: "less_than_or_equal", comparedTo: 300 },
    { key: "partitionStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "orderingMode", operator: "equals", comparedTo: "degraded" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "hotPartitionLagMessages", operator: "greater_than_or_equal", comparedTo: 6_000 },
  ],
  sustainedSeconds: 60,
};
