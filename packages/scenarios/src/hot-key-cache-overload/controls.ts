import type { ControlDefinition } from "@incidentrank/simulator";

/** The real fix #1: replicate the hot key itself across multiple cache
 * shards/nodes so reads for it spread out instead of all landing on one
 * shard. Targets the hot key specifically — it does nothing for any
 * other key's placement. */
export const KEY_REPLICATION_ENABLED_KEY = "keyReplicationEnabled";

/** The real fix #2: collapse concurrent in-flight requests for the same
 * key into a single origin fetch (the rest wait on that one fetch to
 * complete rather than each issuing their own). Directly caps how much a
 * traffic spike on one key can multiply origin load, independent of
 * which shard the key lives on. */
export const REQUEST_COALESCING_ENABLED_KEY = "requestCoalescingEnabled";

/** The real fix #3: an in-process cache at the API tier for the hottest
 * keys, served entirely without a distributed-cache round trip. Removes
 * the hot key's read traffic from the distributed cache (and the
 * question of which shard it hashes to) entirely. */
export const LOCAL_API_CACHE_ENABLED_KEY = "localApiCacheEnabled";

/** Distributed-cache TTL for cached values. A short TTL keeps data
 * fresher but means the hot key re-fetches from origin far more often;
 * a long TTL reduces origin load and shard churn at the cost of staler
 * reads. A genuine freshness-vs-load tradeoff, not a fix by itself. */
export const CACHE_TTL_SECONDS_KEY = "cacheTtlSeconds";

/** Decoy: the number of shards/nodes in the distributed cache cluster.
 * Per this scenario's binding design requirement, adding unrelated
 * capacity elsewhere does nothing for the one shard the hot key already
 * hashes to — that shard's own utilization/latency must stay visibly bad
 * regardless of this control's value. */
export const CACHE_CLUSTER_SIZE_KEY = "cacheClusterSize";

/** Rate-limits/circuit-breaks traffic reaching the origin service when
 * cache misses spike. Protects the origin from being overwhelmed, but
 * does nothing about the hot shard's own utilization/latency — it only
 * shields the tier behind it. */
export const ORIGIN_PROTECTION_ENABLED_KEY = "originProtectionEnabled";

/** Cache key-to-shard assignment strategy. Switching away from
 * consistent hashing to round-robin assignment also spreads the hot
 * key's reads across shards (an alternate way to reach the same
 * spread-the-hot-key outcome as replication), but at the cost of
 * destroying the cache's per-key shard locality for every other key —
 * a real, named tradeoff rather than a strictly better choice. */
export const SHARDING_STRATEGY_KEY = "shardingStrategy";

export const controls: ControlDefinition[] = [
  {
    key: KEY_REPLICATION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REQUEST_COALESCING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: LOCAL_API_CACHE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CACHE_TTL_SECONDS_KEY,
    allowedValues: [30, 90, 5],
    initialValue: 30,
  },
  {
    key: CACHE_CLUSTER_SIZE_KEY,
    allowedValues: [4, 8, 16],
    initialValue: 4,
  },
  {
    key: ORIGIN_PROTECTION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: SHARDING_STRATEGY_KEY,
    allowedValues: ["consistentHash", "roundRobin"],
    initialValue: "consistentHash",
  },
];
