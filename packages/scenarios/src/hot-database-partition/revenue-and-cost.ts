import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_INSTANCE_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "scaled-contention": 700,
  "partition-a-saturated": 650,
  "tenant-concentration": 520,
  "shard-split-pressure-transferred": 150,
  "moderate-throttle-partial": 230,
  "cache-warming": 240,
  "hot-tenant-throttled": 40,
  "round-robin-balanced": 0,
  "shard-split-balanced": 0,
  rebalanced: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 600,
  perUnitMonthlyUsd: {
    [`${API_INSTANCE_COUNT_KEY}:4`]: 0,
    [`${API_INSTANCE_COUNT_KEY}:8`]: 260,
    [`${API_INSTANCE_COUNT_KEY}:16`]: 620,
    [`${API_INSTANCE_COUNT_KEY}:32`]: 1_300,
  },
};

/**
 * Optimal recovery: Partition A's own metrics are healthy AND
 * Partition B shows no sign of absorbed pressure (its latency stays at
 * baseline) AND partitionRebalanceMode is one of the two genuinely
 * complete, no-visible-cost fixes — "rebalanced" (salted-hash
 * re-keying, full tenant equity) or "split-balanced" (shard split paired
 * with least-loaded routing, so the migration cost was absorbed rather
 * than dumped onto Partition B). Gating on partitionBLatencyMs as well
 * as partitionRebalanceMode is deliberate: it's what makes
 * "shard-split-pressure-transferred" (B visibly degraded) fail the
 * optimal bar even though Partition A itself looks fine — see this
 * file's acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "partitionAStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "partitionAQueueDepth", operator: "less_than_or_equal", comparedTo: 10 },
    { key: "partitionBLatencyMs", operator: "less_than_or_equal", comparedTo: 60 },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "unresolved",
    },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "split-pending",
    },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "hot-tenant-constrained",
    },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "round-robin",
    },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: Partition A is genuinely healthy and the shared
 * platform is protected, but by one of two means that carry a real,
 * accepted cost rather than a structural fix —
 *   - "hot-tenant-constrained": the identified hot tenants are strictly
 *     throttled; everyone else on the platform is fully protected, but
 *     the throttled tenants' own throughput is visibly reduced
 *     (throttledRequestRatePerSec > 0). This is the scenario's required
 *     "protect everyone equally vs. constrain one tenant" tradeoff.
 *   - "round-robin": traffic is spread evenly and every symptom clears,
 *     but per-tenant key locality is sacrificed.
 * Both are genuinely safe to hand back — every customer-facing
 * partition is healthy — but neither is the equitable, structural fix.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "partitionAStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "partitionAQueueDepth", operator: "less_than_or_equal", comparedTo: 10 },
    { key: "partitionBLatencyMs", operator: "less_than_or_equal", comparedTo: 60 },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "unresolved",
    },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "split-pending",
    },
    {
      key: "partitionRebalanceMode",
      operator: "not_equals",
      comparedTo: "rebalanced",
    },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "partitionAQueueDepth", operator: "greater_than_or_equal", comparedTo: 1_200 },
  ],
  sustainedSeconds: 60,
};
