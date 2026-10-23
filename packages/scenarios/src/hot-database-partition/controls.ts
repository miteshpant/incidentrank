import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The real routing-side correction: re-keys tenant→partition assignment
 * so no single tenant's traffic concentrates on one shard, regardless of
 * that tenant's volume. "tenantHash" (initial) hashes directly on tenant
 * ID, which is exactly why a handful of high-volume tenants can land on
 * the same partition. "saltedHash" distributes each hot tenant's own
 * traffic across multiple partitions by salting the hash with a
 * sub-shard index. "roundRobin" ignores tenant identity entirely and
 * distributes writes/reads evenly, which also clears the hot-partition
 * symptom but sacrifices per-tenant data locality (a real engineering
 * tradeoff captured in metrics.ts's partitioningMode).
 */
export const PARTITIONING_STRATEGY_KEY = "partitioningStrategy";

/**
 * Per-tenant rate limiting applied specifically to the identified
 * high-volume tenants, independent of the partitioning strategy. "off"
 * applies no limit; "moderate" trims bursts without materially changing
 * the tenants' own experience; "strict" meaningfully throttles the hot
 * tenants' request rate to protect the shared partition, at the direct
 * cost of those tenants' own throughput — the scenario's core
 * protect-everyone-equally vs. constrain-one-tenant tradeoff.
 */
export const TENANT_THROTTLE_KEY = "tenantThrottle";

/**
 * Splits Partition A's key range into two shards so the hot tenants'
 * load is spread across more hardware. A genuine structural fix, but the
 * split/rebalance itself has to copy a portion of Partition A's data and
 * temporarily routes some of that range's traffic through Partition B's
 * capacity while the migration completes — the scenario's required
 * pressure-transfer: relieving Partition A visibly constrains Partition
 * B until the split finishes.
 */
export const SHARD_SPLIT_INITIATED_KEY = "shardSplitInitiated";

/**
 * Routing-layer policy for which partition replica handles a given
 * request. "direct" always routes to the assigned partition's primary.
 * "leastLoaded" lets read traffic fail over to a less-loaded replica
 * when the assigned partition is under pressure — real relief for read
 * load, but it does nothing for the write traffic that still has to hit
 * the assigned partition, and it does not address the skew itself.
 */
export const ROUTING_POLICY_KEY = "routingPolicy";

/**
 * A routing-layer read cache specifically for the identified hot
 * tenants. Shields Partition A from repeat identical reads once warm,
 * but a cold cache under live load still has to serve the first read of
 * each key from the same overloaded partition.
 */
export const HOT_TENANT_CACHE_ENABLED_KEY = "hotTenantCacheEnabled";

/**
 * Broad horizontal scaling of the stateless API tier. Per the
 * scenario's design requirement, this cannot fix a skew problem: more
 * API instances just means more concurrent connections hammering the
 * same already-hot Partition A, while Partitions B/C/D sit idle.
 */
export const API_INSTANCE_COUNT_KEY = "apiInstanceCount";

export const controls: ControlDefinition[] = [
  {
    key: PARTITIONING_STRATEGY_KEY,
    allowedValues: ["tenantHash", "saltedHash", "roundRobin"],
    initialValue: "tenantHash",
  },
  {
    key: TENANT_THROTTLE_KEY,
    allowedValues: ["off", "moderate", "strict"],
    initialValue: "off",
  },
  {
    key: SHARD_SPLIT_INITIATED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: ROUTING_POLICY_KEY,
    allowedValues: ["direct", "leastLoaded"],
    initialValue: "direct",
  },
  {
    key: HOT_TENANT_CACHE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: API_INSTANCE_COUNT_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
];
