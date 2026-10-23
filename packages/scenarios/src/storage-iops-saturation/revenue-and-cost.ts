import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { QUERY_CONCURRENCY_LIMIT_KEY, STORAGE_TIER_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "iops-saturated": 520,
  "iops-rising": 460,
  "query-throttled-api-degraded": 540,
  "checkpoint-extended": 180,
  "read-cache-warming": 150,
  "reduced-concurrency": 40,
  "paused-backlog-starting": 0,
  "paused-backlog-rising": 0,
  "paused-backlog-critical": 0,
  "tier-upgraded": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_800,
  perUnitMonthlyUsd: {
    [`${STORAGE_TIER_KEY}:standard`]: 0,
    // A real, nonzero, but proportionate ongoing cost increase for the
    // durable fix — large enough that costEfficiency still honestly
    // distinguishes it from the zero-infra-cost workload-pause
    // tradeoff, but not so large relative to baseline that the optimal
    // path's total score falls below the acceptable path's (the
    // section 16/17 "suspicious result" this value was tuned against:
    // see storage-iops-saturation.test.ts's Scoring describe block).
    [`${STORAGE_TIER_KEY}:provisioned-iops`]: 650,
    [`${QUERY_CONCURRENCY_LIMIT_KEY}:200`]: 0,
    [`${QUERY_CONCURRENCY_LIMIT_KEY}:100`]: 0,
    [`${QUERY_CONCURRENCY_LIMIT_KEY}:50`]: 0,
  },
};

/**
 * Full recovery: the storage tier was genuinely upgraded
 * (storageRecoveryMode === "tier-upgraded"). Every customer-facing
 * metric is healthy AND the batch job keeps running at full throughput
 * with zero backlog — a durable fix that required no tradeoff against
 * the background workload at all. Gating on storageRecoveryMode rather
 * than only the numeric metrics is deliberate: pausing the workload
 * also drives storageIopsUtilization/apiLatencyMs to healthy levels,
 * but that is the acceptable tier below, not optimal — see this file's
 * acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "storageIopsUtilization", operator: "less_than_or_equal", comparedTo: 40 },
    { key: "storageStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "storageRecoveryMode", operator: "equals", comparedTo: "tier-upgraded" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: the background workload is paused
 * (storageRecoveryMode === "workload-paused"). Every metric the
 * candidate can see is genuinely healthy, but this is reached only by
 * suppressing the batch job's own progress, not by fixing storage's
 * actual IOPS ceiling — see completion-mode audit in definition.ts. A
 * growing batchBacklogMinutes alongside this tier is expected and does
 * not, by itself, disqualify the handback: it is the known, bounded
 * cost of the tradeoff, not evidence the customer-facing system is
 * unsafe.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "storageIopsUtilization", operator: "less_than_or_equal", comparedTo: 40 },
    { key: "storageStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "storageRecoveryMode", operator: "equals", comparedTo: "workload-paused" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "storageIopsUtilization", operator: "greater_than_or_equal", comparedTo: 95 },
  ],
  sustainedSeconds: 60,
};
