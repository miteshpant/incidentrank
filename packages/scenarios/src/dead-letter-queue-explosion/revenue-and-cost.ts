import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CONSUMER_INSTANCE_COUNT_KEY, RETRY_DELAY_MS_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "backlog-catchup": 520,
  "scaled-consumers-worsened": 480,
  "dlq-growing": 380,
  "unfiltered-replay-risk": 260,
  "replay-paused-backlog-growing": 150,
  "dlq-discarded": 10,
  "recovered-replay-paused": 20,
  "recovered-fixed": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 220,
  perUnitMonthlyUsd: {
    [`${CONSUMER_INSTANCE_COUNT_KEY}:4`]: 40,
    [`${CONSUMER_INSTANCE_COUNT_KEY}:8`]: 120,
    [`${CONSUMER_INSTANCE_COUNT_KEY}:16`]: 280,
    [`${RETRY_DELAY_MS_KEY}:1000`]: 0,
    [`${RETRY_DELAY_MS_KEY}:5000`]: 0,
  },
};

/**
 * Full recovery: the parser/schema fix is live (no new events entering
 * the DLQ), disciplined filtered replay has drained the backlog, and
 * duplicate-processing risk never rose. Gating on dataLossState !==
 * "eventsPurged" is the binding requirement for this scenario's batch
 * (phase6b.md's correctness-heavy gate) — a state reached by discarding
 * the DLQ must never satisfy this condition no matter how clean
 * dlqDepth/mainQueueLagMessages/duplicateProcessingRiskScore look,
 * because the DLQ-discarded rule state (see rules.ts) also keeps every
 * operational metric clean. The explicit dataLossState check is what
 * actually blocks it.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "dlqDepth", operator: "less_than_or_equal", comparedTo: 50 },
    { key: "dlqGrowthRatePerMin", operator: "equals", comparedTo: 0 },
    { key: "mainQueueLagMessages", operator: "less_than_or_equal", comparedTo: 50 },
    { key: "duplicateProcessingRiskScore", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "consumerStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "dataLossState", operator: "not_equals", comparedTo: "eventsPurged" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: the parser fix is live and replay is paused
 * rather than drained. No new failures, no duplicate-processing risk,
 * and nothing lost — but the existing backlog is still sitting in the
 * DLQ, undrained. Genuinely safe to hand back (nothing is actively
 * getting worse), just not the fully completed cleanup. Also gated on
 * dataLossState !== "eventsPurged" for the same reason as above.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "dlqGrowthRatePerMin", operator: "equals", comparedTo: 0 },
    { key: "duplicateProcessingRiskScore", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "consumerStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "dataLossState", operator: "not_equals", comparedTo: "eventsPurged" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "mainQueueLagMessages", operator: "greater_than_or_equal", comparedTo: 1_200 }],
  sustainedSeconds: 60,
};
