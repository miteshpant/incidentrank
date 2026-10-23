import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  PARTITIONING_STRATEGY_KEY,
  ROUTING_POLICY_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  TENANT_THROTTLE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  "routing-layer": "healthy",
  "partition-a": "healthy",
  "partition-b": "healthy",
  "partition-c": "healthy",
  "partition-d": "healthy",
};

const partitionACriticalHealth: Record<string, ComponentHealth> = {
  api: "degraded",
  "routing-layer": "degraded",
  "partition-a": "critical",
  "partition-b": "healthy",
  "partition-c": "healthy",
  "partition-d": "healthy",
};

const partitionADegradedHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  "routing-layer": "degraded",
  "partition-a": "degraded",
  "partition-b": "healthy",
  "partition-c": "healthy",
  "partition-d": "healthy",
};

// The pressure-transfer health snapshot: Partition A relieved, Partition
// B now visibly constrained by absorbing shard-split migration load.
const shardSplitTransferHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  "routing-layer": "healthy",
  "partition-a": "healthy",
  "partition-b": "degraded",
  "partition-c": "healthy",
  "partition-d": "healthy",
};

const allPartitionsCriticalHealth: Record<string, ComponentHealth> = {
  api: "critical",
  "routing-layer": "critical",
  "partition-a": "critical",
  "partition-b": "healthy",
  "partition-c": "healthy",
  "partition-d": "healthy",
};

/**
 * Authored rule table for Hot Database Partition, ordered most-specific
 * first. A small number of high-volume tenants hash onto Partition A;
 * its request rate, latency, and queue depth climb while B/C/D stay
 * flat. Three distinct recovery strategies exist:
 *
 *   1. Re-key with a salted hash (saltedHash) — spreads every tenant's
 *      traffic, including the hot ones, across all four partitions.
 *      This is the durable, tenant-equitable fix: OPTIMAL.
 *   2. Round-robin keying — also clears the skew symptom completely,
 *      but abandons per-tenant key locality (a real tradeoff some
 *      businesses accept, others don't): ACCEPTABLE, not optimal.
 *   3. Strict per-tenant throttling of the identified hot tenants,
 *      leaving the hash strategy untouched — protects every OTHER
 *      tenant and the shared partition, at the direct cost of the hot
 *      tenants' own throughput: ACCEPTABLE, a genuine "protect the
 *      platform vs. protect one tenant equally" tradeoff.
 *
 * Two harmful/incomplete traps exist:
 *   - Scaling API instances broadly does nothing for the skew — more
 *     connections just pile onto the same hot Partition A while B/C/D
 *     sit idle, and connection contention on A gets WORSE.
 *   - Initiating a shard split without ALSO relieving load (throttle or
 *     re-keying) distributes some of Partition A's load onto newly
 *     carved capacity pulled from Partition B's own headroom — a real,
 *     durable relief for Partition A, but it leaves Partition B running
 *     permanently warmer as the direct, visible cost (the required
 *     pressure-transfer). Pairing the split with least-loaded routing
 *     lets B's read traffic fail over elsewhere, absorbing that cost.
 */
export const hotDatabasePartitionRules: Rule[] = [
  // ── Optimal recovery: salted-hash re-keying. Spreads the hot tenants'
  // own traffic across all four partitions regardless of volume, so
  // Partition A's rate/latency/queue return to baseline and the
  // per-tenant traffic-share metric flattens. Checked first so it wins
  // over every other control combination once applied.
  {
    id: "salted-hash-recovery",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: { [PARTITIONING_STRATEGY_KEY]: "saltedHash" },
    },
    incidentState: "rebalanced",
    values: {
      partitionARequestRate: 410,
      partitionBRequestRate: 405,
      partitionCRequestRate: 400,
      partitionDRequestRate: 395,
      partitionALatencyMs: 22,
      partitionAQueueDepth: 0,
      partitionBLatencyMs: 23,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 9,
      globalApiLatencyMs: 42,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "normal",
      partitionRebalanceMode: "rebalanced",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate good path: round-robin keying. Also clears
  // every symptom, but sacrifices per-tenant key locality.
  {
    id: "round-robin-recovery-tradeoff",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: { [PARTITIONING_STRATEGY_KEY]: "roundRobin" },
    },
    incidentState: "round-robin-balanced",
    values: {
      partitionARequestRate: 400,
      partitionBRequestRate: 400,
      partitionCRequestRate: 400,
      partitionDRequestRate: 400,
      partitionALatencyMs: 24,
      partitionAQueueDepth: 0,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 25,
      globalApiLatencyMs: 44,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "normal",
      partitionRebalanceMode: "round-robin",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate good path: strict hot-tenant throttling,
  // hash strategy untouched. Partition A's load drops because the hot
  // tenants' own request rate is directly capped — every other tenant
  // and the shared partition are protected, but the throttled tenants'
  // own throughput is visibly reduced (throttledRequestRatePerSec > 0).
  {
    id: "strict-throttle-protects-platform",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: {
        [TENANT_THROTTLE_KEY]: "strict",
        [PARTITIONING_STRATEGY_KEY]: "tenantHash",
      },
    },
    incidentState: "hot-tenant-throttled",
    values: {
      partitionARequestRate: 430,
      partitionBRequestRate: 380,
      partitionCRequestRate: 390,
      partitionDRequestRate: 370,
      partitionALatencyMs: 28,
      partitionAQueueDepth: 5,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 10,
      globalApiLatencyMs: 48,
      throttledRequestRatePerSec: 260,
      partitionAStatus: "normal",
      partitionRebalanceMode: "hot-tenant-constrained",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful: API instances scaled broadly while concentration is
  // rising and no rebalancing/throttling has happened. Every added
  // instance opens more concurrent connections to the SAME hot
  // Partition A — queue depth and latency there get worse, while B/C/D
  // remain idle and unaffected. Broad capacity cannot fix skew.
  {
    id: "broad-scaling-worsens-hot-partition",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlAtLeast: { [API_INSTANCE_COUNT_KEY]: 16 },
      controlEquals: {
        [PARTITIONING_STRATEGY_KEY]: "tenantHash",
        [TENANT_THROTTLE_KEY]: "off",
      },
    },
    incidentState: "scaled-contention",
    values: {
      partitionARequestRate: 3_400,
      partitionBRequestRate: 390,
      partitionCRequestRate: 395,
      partitionDRequestRate: 375,
      partitionALatencyMs: 2_600,
      partitionAQueueDepth: 980,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 82,
      globalApiLatencyMs: 2_100,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "critical",
      partitionRebalanceMode: "unresolved",
    },
    componentHealth: allPartitionsCriticalHealth,
  },

  // ── Pressure-transfer: shard split initiated while the hash strategy
  // and throttle are untouched, WITHOUT least-loaded routing to absorb
  // Partition B's share of the migration cost. Partition A's own
  // numbers genuinely improve (its key range is now split across two
  // shards), but the split pulled some of that extra capacity from
  // Partition B, which now runs permanently warmer as the direct,
  // visible consequence. This is the scenario's required secondary-
  // subsystem constraint.
  {
    id: "shard-split-transfers-pressure-to-partition-b",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: {
        [SHARD_SPLIT_INITIATED_KEY]: true,
        [ROUTING_POLICY_KEY]: "direct",
        [PARTITIONING_STRATEGY_KEY]: "tenantHash",
      },
    },
    incidentState: "shard-split-pressure-transferred",
    values: {
      partitionARequestRate: 480,
      partitionBRequestRate: 980,
      partitionCRequestRate: 395,
      partitionDRequestRate: 375,
      partitionALatencyMs: 30,
      partitionAQueueDepth: 0,
      partitionBLatencyMs: 410,
      partitionBQueueDepth: 260,
      hotTenantTrafficSharePct: 14,
      globalApiLatencyMs: 90,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "normal",
      partitionRebalanceMode: "split-pending",
    },
    componentHealth: shardSplitTransferHealth,
  },

  // ── Shard split paired with least-loaded routing: Partition B's
  // absorbed migration read traffic can now fail over to Partition C/D
  // instead of queueing on B alone, resolving the pressure-transfer
  // without sacrificing the structural fix.
  {
    id: "shard-split-with-least-loaded-routing-resolves-transfer",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: {
        [SHARD_SPLIT_INITIATED_KEY]: true,
        [ROUTING_POLICY_KEY]: "leastLoaded",
        [PARTITIONING_STRATEGY_KEY]: "tenantHash",
      },
    },
    incidentState: "shard-split-balanced",
    values: {
      partitionARequestRate: 470,
      partitionBRequestRate: 520,
      partitionCRequestRate: 460,
      partitionDRequestRate: 455,
      partitionALatencyMs: 28,
      partitionAQueueDepth: 0,
      partitionBLatencyMs: 40,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 14,
      globalApiLatencyMs: 48,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "normal",
      partitionRebalanceMode: "split-balanced",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial relief: hot-tenant cache enabled without any rebalancing
  // or throttling. Repeat reads for the hot tenants' most-fetched keys
  // are absorbed by the routing-layer cache, but writes and every
  // cache-miss read still land on Partition A, so relief is incomplete.
  {
    id: "hot-tenant-cache-partial-relief",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: {
        [HOT_TENANT_CACHE_ENABLED_KEY]: true,
        [PARTITIONING_STRATEGY_KEY]: "tenantHash",
        [TENANT_THROTTLE_KEY]: "off",
        [SHARD_SPLIT_INITIATED_KEY]: false,
      },
    },
    incidentState: "cache-warming",
    values: {
      partitionARequestRate: 1_250,
      partitionBRequestRate: 385,
      partitionCRequestRate: 392,
      partitionDRequestRate: 372,
      partitionALatencyMs: 640,
      partitionAQueueDepth: 180,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 55,
      globalApiLatencyMs: 520,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "warning",
      partitionRebalanceMode: "unresolved",
    },
    componentHealth: partitionADegradedHealth,
  },

  // ── Partial relief: moderate throttle only. Trims bursts without
  // meaningfully reducing the hot tenants' sustained volume, so
  // Partition A stays degraded rather than critical.
  {
    id: "moderate-throttle-partial-relief",
    when: {
      triggerEquals: { tenantConcentrationRising: true },
      controlEquals: {
        [TENANT_THROTTLE_KEY]: "moderate",
        [PARTITIONING_STRATEGY_KEY]: "tenantHash",
        [SHARD_SPLIT_INITIATED_KEY]: false,
      },
    },
    incidentState: "moderate-throttle-partial",
    values: {
      partitionARequestRate: 1_900,
      partitionBRequestRate: 385,
      partitionCRequestRate: 392,
      partitionDRequestRate: 372,
      partitionALatencyMs: 920,
      partitionAQueueDepth: 260,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 66,
      globalApiLatencyMs: 740,
      throttledRequestRatePerSec: 60,
      partitionAStatus: "warning",
      partitionRebalanceMode: "unresolved",
    },
    componentHealth: partitionADegradedHealth,
  },

  // ── Second wave, baseline: sustained unmitigated concentration
  // finally saturates Partition A's request-handling ceiling. Only
  // reachable once no mitigation above has matched.
  {
    id: "partition-a-saturated-baseline",
    when: { triggerEquals: { tenantConcentrationRising: true, partitionASaturating: true } },
    incidentState: "partition-a-saturated",
    values: {
      partitionARequestRate: 4_100,
      partitionBRequestRate: 385,
      partitionCRequestRate: 392,
      partitionDRequestRate: 372,
      partitionALatencyMs: 3_200,
      partitionAQueueDepth: 1_400,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 88,
      globalApiLatencyMs: 2_600,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "critical",
      partitionRebalanceMode: "unresolved",
    },
    componentHealth: partitionACriticalHealth,
  },

  // ── Baseline critical: hot tenants are concentrating traffic on
  // Partition A and the candidate has taken no meaningfully mitigating
  // action yet.
  {
    id: "tenant-concentration-baseline",
    when: { triggerEquals: { tenantConcentrationRising: true } },
    incidentState: "tenant-concentration",
    values: {
      partitionARequestRate: 2_600,
      partitionBRequestRate: 385,
      partitionCRequestRate: 392,
      partitionDRequestRate: 372,
      partitionALatencyMs: 1_800,
      partitionAQueueDepth: 620,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 76,
      globalApiLatencyMs: 1_450,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "critical",
      partitionRebalanceMode: "unresolved",
    },
    componentHealth: partitionACriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      partitionARequestRate: 400,
      partitionBRequestRate: 380,
      partitionCRequestRate: 390,
      partitionDRequestRate: 370,
      partitionALatencyMs: 25,
      partitionAQueueDepth: 0,
      partitionBLatencyMs: 24,
      partitionBQueueDepth: 0,
      hotTenantTrafficSharePct: 8,
      globalApiLatencyMs: 45,
      throttledRequestRatePerSec: 0,
      partitionAStatus: "normal",
      partitionRebalanceMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
