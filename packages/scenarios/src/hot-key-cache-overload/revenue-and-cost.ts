import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CACHE_CLUSTER_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "eviction-cascade": 780,
  "ttl-shortened-worsened": 700,
  "hot-key-spike": 560,
  "cluster-scaled-no-relief": 560,
  "origin-shielded": 540,
  "ttl-extended-partial": 260,
  "round-robin-spread": 0,
  replicated: 0,
  coalesced: 0,
  "local-cached": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${CACHE_CLUSTER_SIZE_KEY}:4`]: 0,
    [`${CACHE_CLUSTER_SIZE_KEY}:8`]: 300,
    [`${CACHE_CLUSTER_SIZE_KEY}:16`]: 700,
  },
};

/**
 * Full recovery: the hot shard's own utilization/latency are healthy AND
 * hotKeyMitigationMode is "targeted" — one of the three genuine,
 * hot-key-specific fixes (replication, coalescing, or local API
 * caching) was applied. Gating on hotKeyMitigationMode rather than only
 * the numeric metrics is deliberate: round-robin sharding also drives
 * hotShardUtilizationPct/hotShardLatencyMs to healthy levels, but that
 * is the acceptable tier below, not optimal — see this file's
 * acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "hotShardStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "hotShardUtilizationPct", operator: "less_than_or_equal", comparedTo: 40 },
    { key: "hotKeyMitigationMode", operator: "equals", comparedTo: "targeted" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: every customer-facing metric the candidate can
 * see (hot-shard utilization/latency, cache hit rate, API latency) is
 * genuinely healthy, but only because round-robin shard assignment
 * (hotKeyMitigationMode === "locality-sacrificed") spread the hot key's
 * traffic at the cost of abandoning consistent per-key shard placement
 * for every other key in the cluster — a real, named, operationally
 * safe tradeoff, not the structural fix.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "hotShardStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "hotShardUtilizationPct", operator: "less_than_or_equal", comparedTo: 40 },
    { key: "hotKeyMitigationMode", operator: "equals", comparedTo: "locality-sacrificed" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "hotShardUtilizationPct", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
