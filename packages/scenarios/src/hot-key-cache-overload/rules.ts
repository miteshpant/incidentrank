import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_CLUSTER_SIZE_KEY,
  CACHE_TTL_SECONDS_KEY,
  KEY_REPLICATION_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "cache-hot-shard": "healthy",
  "cache-other-shards": "healthy",
  origin: "healthy",
};

const hotShardCriticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "degraded",
  "cache-hot-shard": "critical",
  "cache-other-shards": "healthy",
  origin: "degraded",
};

const hotShardDegradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "cache-hot-shard": "degraded",
  "cache-other-shards": "healthy",
  origin: "healthy",
};

// Origin shielded, but the hot shard itself (the actual bottleneck) is
// still critical — the required "masking a downstream symptom, not the
// real constraint" state.
const originShieldedHotShardCriticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "degraded",
  "cache-hot-shard": "critical",
  "cache-other-shards": "healthy",
  origin: "healthy",
};

const evictionCascadeHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "critical",
  "cache-hot-shard": "critical",
  "cache-other-shards": "healthy",
  origin: "critical",
};

/**
 * Authored rule table for Hot-Key Cache Overload, ordered most-specific
 * first. One extremely popular key hashes onto a single cache shard; its
 * request rate, utilization, and latency climb while the rest of the
 * cache cluster stays flat. Three distinct genuine fixes exist, each
 * targeting the hot key specifically rather than the cache tier broadly:
 *
 *   1. keyReplicationEnabled — replicate the hot key across multiple
 *      shards/nodes so its own read traffic spreads out: OPTIMAL.
 *   2. requestCoalescingEnabled — collapse concurrent in-flight requests
 *      for the hot key into one origin fetch, capping both origin load
 *      and the re-insertion churn that was driving hot-shard
 *      utilization: OPTIMAL (alternate good path).
 *   3. localApiCacheEnabled — serve the hot key entirely from an
 *      in-process API-tier cache, removing its traffic from the
 *      distributed cache altogether: OPTIMAL (alternate good path).
 *
 * One alternate strategy reaches the same symptom-free state at a named
 * cost: shardingStrategy=roundRobin also spreads the hot key's traffic,
 * but abandons consistent per-key shard placement for every other key in
 * the cluster — ACCEPTABLE, not optimal.
 *
 * Required design property: cacheClusterSize (scaling the cache cluster
 * broadly) must do nothing for the hot shard itself. Its own request
 * rate, utilization, and latency stay bad regardless of this control's
 * value, because the hot KEY still hashes to the same ONE shard no
 * matter how many unrelated shards exist.
 *
 * originProtectionEnabled shields the origin service from the cache-miss
 * stampede but leaves the hot shard itself — the actual bottleneck —
 * fully saturated: a real, visible instance of masking a downstream
 * symptom rather than fixing the constraint.
 */
export const hotKeyCacheOverloadRules: Rule[] = [
  // ── Optimal recovery #1: the hot key is replicated across shards.
  // Its own read traffic now spreads across multiple nodes instead of
  // concentrating on one, so hot-shard utilization/latency return to
  // baseline regardless of every other control. Checked first so it
  // wins over every other combination once applied.
  {
    id: "key-replication-recovery",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: { [KEY_REPLICATION_ENABLED_KEY]: true },
    },
    incidentState: "replicated",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 24,
      hotShardLatencyMs: 9,
      otherShardsUtilizationPct: 30,
      otherShardsLatencyMs: 10,
      cacheHitRatePct: 98,
      originRequestRatePerSec: 55,
      apiLatencyMs: 22,
      hotShardStatus: "normal",
      hotKeyMitigationMode: "targeted",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery #2: request coalescing. Concurrent requests for
  // the hot key collapse into a single origin fetch and a single
  // shard re-insertion, directly capping both origin load and the
  // re-insertion churn that was driving hot-shard utilization —
  // without needing to touch where the key is placed at all.
  {
    id: "request-coalescing-recovery",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: { [REQUEST_COALESCING_ENABLED_KEY]: true },
    },
    incidentState: "coalesced",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 26,
      hotShardLatencyMs: 10,
      otherShardsUtilizationPct: 22,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 99,
      originRequestRatePerSec: 12,
      apiLatencyMs: 24,
      hotShardStatus: "normal",
      hotKeyMitigationMode: "targeted",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery #3: local API-tier caching. The hot key is
  // served entirely from in-process memory at the API layer, so its
  // traffic never reaches the distributed cache (or any shard) at all.
  {
    id: "local-api-cache-recovery",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: { [LOCAL_API_CACHE_ENABLED_KEY]: true },
    },
    incidentState: "local-cached",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 21,
      hotShardLatencyMs: 8,
      otherShardsUtilizationPct: 22,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 97,
      originRequestRatePerSec: 20,
      apiLatencyMs: 18,
      hotShardStatus: "normal",
      hotKeyMitigationMode: "targeted",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate path: round-robin shard assignment also
  // spreads the hot key's traffic, clearing every symptom — but it
  // abandons consistent per-key shard placement for every OTHER key in
  // the cluster as the named, accepted cost.
  {
    id: "round-robin-sharding-tradeoff",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: { [SHARDING_STRATEGY_KEY]: "roundRobin" },
    },
    incidentState: "round-robin-spread",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 28,
      hotShardLatencyMs: 11,
      otherShardsUtilizationPct: 30,
      otherShardsLatencyMs: 11,
      cacheHitRatePct: 96,
      originRequestRatePerSec: 60,
      apiLatencyMs: 26,
      hotShardStatus: "normal",
      hotKeyMitigationMode: "locality-sacrificed",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful/decoy: cache cluster scaled up broadly while no
  // hot-key-specific mitigation is applied. The hot key still hashes to
  // the SAME one shard no matter how many unrelated shards exist, so
  // the hot shard's own utilization/latency stay exactly as saturated
  // as the baseline — the scenario's binding design requirement.
  // Modeled as its own rule (rather than silently falling through to
  // baseline) so the "nothing changed on the hot shard despite adding
  // capacity" lesson is visible and authored, not an accident of rule
  // ordering.
  {
    id: "broad-cluster-scaling-does-not-help-hot-shard",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlAtLeast: { [CACHE_CLUSTER_SIZE_KEY]: 8 },
      controlEquals: {
        [KEY_REPLICATION_ENABLED_KEY]: false,
        [REQUEST_COALESCING_ENABLED_KEY]: false,
        [LOCAL_API_CACHE_ENABLED_KEY]: false,
        [SHARDING_STRATEGY_KEY]: "consistentHash",
      },
    },
    incidentState: "cluster-scaled-no-relief",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 97,
      hotShardLatencyMs: 1_900,
      otherShardsUtilizationPct: 19,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 74,
      originRequestRatePerSec: 1_250,
      apiLatencyMs: 1_600,
      hotShardStatus: "critical",
      hotKeyMitigationMode: "unresolved",
    },
    componentHealth: hotShardCriticalHealth,
  },

  // ── Real but incomplete: origin protection shields the origin
  // service from the cache-miss stampede (origin request rate capped),
  // but the hot shard itself — the actual constraint — is untouched and
  // stays fully saturated. A visible instance of masking a downstream
  // symptom rather than fixing the bottleneck.
  {
    id: "origin-protection-masks-not-fixes",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: {
        [ORIGIN_PROTECTION_ENABLED_KEY]: true,
        [KEY_REPLICATION_ENABLED_KEY]: false,
        [REQUEST_COALESCING_ENABLED_KEY]: false,
        [LOCAL_API_CACHE_ENABLED_KEY]: false,
        [SHARDING_STRATEGY_KEY]: "consistentHash",
      },
    },
    incidentState: "origin-shielded",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 96,
      hotShardLatencyMs: 1_850,
      otherShardsUtilizationPct: 20,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 80,
      originRequestRatePerSec: 90,
      apiLatencyMs: 1_550,
      hotShardStatus: "critical",
      hotKeyMitigationMode: "origin-shielded",
    },
    componentHealth: originShieldedHotShardCriticalHealth,
  },

  // ── Partial relief: a longer TTL reduces re-fetch churn somewhat, but
  // the hot shard is still serving the full hit volume for the key at
  // full request rate — the underlying concentration remains.
  {
    id: "longer-ttl-partial-relief",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: {
        [KEY_REPLICATION_ENABLED_KEY]: false,
        [REQUEST_COALESCING_ENABLED_KEY]: false,
        [LOCAL_API_CACHE_ENABLED_KEY]: false,
        [SHARDING_STRATEGY_KEY]: "consistentHash",
      },
      controlAtLeast: { [CACHE_TTL_SECONDS_KEY]: 90 },
    },
    incidentState: "ttl-extended-partial",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 82,
      hotShardLatencyMs: 820,
      otherShardsUtilizationPct: 20,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 93,
      originRequestRatePerSec: 220,
      apiLatencyMs: 700,
      hotShardStatus: "warning",
      hotKeyMitigationMode: "unresolved",
    },
    componentHealth: hotShardDegradedHealth,
  },

  // ── Harmful: shortening the TTL while nothing else is fixed makes
  // the hot key re-fetch from origin far more often, driving MORE churn
  // onto the already-hot shard and MORE load onto origin.
  {
    id: "shorter-ttl-worsens-churn",
    when: {
      triggerEquals: { hotKeySpike: true },
      controlEquals: {
        [KEY_REPLICATION_ENABLED_KEY]: false,
        [REQUEST_COALESCING_ENABLED_KEY]: false,
        [LOCAL_API_CACHE_ENABLED_KEY]: false,
        [SHARDING_STRATEGY_KEY]: "consistentHash",
      },
      controlAtMost: { [CACHE_TTL_SECONDS_KEY]: 5 },
    },
    incidentState: "ttl-shortened-worsened",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 99,
      hotShardLatencyMs: 2_400,
      otherShardsUtilizationPct: 20,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 58,
      originRequestRatePerSec: 2_100,
      apiLatencyMs: 2_200,
      hotShardStatus: "critical",
      hotKeyMitigationMode: "unresolved",
    },
    componentHealth: hotShardCriticalHealth,
  },

  // ── Second wave, baseline: sustained unmitigated hot-key load
  // exhausts the hot shard's memory headroom; it begins evicting
  // unrelated cold keys, so origin traffic climbs further still — the
  // delayed consequence, reachable only once no mitigation above has
  // matched.
  {
    id: "eviction-cascade-baseline",
    when: { triggerEquals: { hotKeySpike: true, hotShardEvicting: true } },
    incidentState: "eviction-cascade",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 99,
      hotShardLatencyMs: 3_100,
      otherShardsUtilizationPct: 19,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 41,
      originRequestRatePerSec: 3_400,
      apiLatencyMs: 2_900,
      hotShardStatus: "critical",
      hotKeyMitigationMode: "unresolved",
    },
    componentHealth: evictionCascadeHealth,
  },

  // ── Baseline critical: the hot key spike has started and the
  // candidate has taken no meaningfully mitigating action yet.
  {
    id: "hot-key-spike-baseline",
    when: { triggerEquals: { hotKeySpike: true } },
    incidentState: "hot-key-spike",
    values: {
      hotKeyTrafficRps: 9_000,
      hotShardUtilizationPct: 92,
      hotShardLatencyMs: 1_400,
      otherShardsUtilizationPct: 20,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 88,
      originRequestRatePerSec: 650,
      apiLatencyMs: 1_200,
      hotShardStatus: "critical",
      hotKeyMitigationMode: "unresolved",
    },
    componentHealth: hotShardCriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      hotKeyTrafficRps: 400,
      hotShardUtilizationPct: 20,
      hotShardLatencyMs: 8,
      otherShardsUtilizationPct: 22,
      otherShardsLatencyMs: 9,
      cacheHitRatePct: 97,
      originRequestRatePerSec: 60,
      apiLatencyMs: 25,
      hotShardStatus: "normal",
      hotKeyMitigationMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
