import type { ControlDefinition } from "@incidentrank/simulator";

/** Throttles accepted write volume at the primary. Protects replication
 * freshness (lag and stale-read age fall) at a direct, modeled cost:
 * write acceptance rate drops, so legitimate write traffic is turned
 * away or delayed. "aggressive" buys the most freshness but accepts the
 * least traffic. */
export const WRITE_THROTTLE_LEVEL_KEY = "writeThrottleLevel";

/** Parallel replication apply workers consuming the replication stream.
 * Raising this increases replica apply rate — but only up to a real
 * ceiling: once network/storage pressure is already elevated, adding
 * workers stops helping (and can even add contention) because the
 * constraint has moved off "not enough workers" and onto the
 * network/storage path itself. */
export const REPLICATION_WORKER_COUNT_KEY = "replicationWorkerCount";

/** How writes are batched/compressed before being shipped down the
 * replication stream. Compressing batches reduces the network bytes per
 * applied write, raising effective apply throughput without raising
 * write-acceptance cost — but only within the worker/network ceiling
 * above; it cannot substitute for insufficient apply parallelism. */
export const BATCHING_MODE_KEY = "batchingMode";

/** Where reads are served from. Routing more reads to the primary
 * protects read freshness (eliminates stale-read risk for the traffic
 * routed there) at a direct cost: primary load and primary read latency
 * rise, competing with the primary's own write-serving capacity. */
export const READ_ROUTING_KEY = "readRouting";

/** Whether non-critical write traffic is deprioritized in favor of
 * critical writes when the primary is under replication pressure. */
export const TRAFFIC_PRIORITY_KEY = "trafficPriority";

/** Number of replicas in the fleet. Each additional replica consumes
 * more of the primary's replication fan-out bandwidth per committed
 * write, so adding replicas while backlogged does not, by itself,
 * relieve an existing single-stream backlog — it adds another consumer
 * competing for the same already-constrained replication capacity. */
export const REPLICA_COUNT_KEY = "replicaCount";

export const controls: ControlDefinition[] = [
  {
    key: WRITE_THROTTLE_LEVEL_KEY,
    allowedValues: ["none", "moderate", "aggressive"],
    initialValue: "none",
  },
  {
    key: REPLICATION_WORKER_COUNT_KEY,
    allowedValues: [2, 4, 8, 16],
    initialValue: 2,
  },
  {
    key: BATCHING_MODE_KEY,
    allowedValues: ["uncompressed-small-batch", "compressed-batch", "large-uncompressed-batch"],
    initialValue: "uncompressed-small-batch",
  },
  {
    key: READ_ROUTING_KEY,
    allowedValues: ["replica-only", "primary-for-fresh-reads", "primary-only"],
    initialValue: "replica-only",
  },
  {
    key: TRAFFIC_PRIORITY_KEY,
    allowedValues: ["balanced", "prioritize-critical-writes"],
    initialValue: "balanced",
  },
  {
    key: REPLICA_COUNT_KEY,
    allowedValues: [1, 2, 3],
    initialValue: 1,
  },
];
