import type { ControlDefinition } from "@incidentrank/simulator";

/** Configured cache cluster size. Starts at 3 — the cluster's normal,
 * pre-incident provisioned size. One of those 3 nodes fails during the
 * incident; because the failed node stays down until it is replaced,
 * simply leaving this control at its original value of 3 means the
 * cluster is still only running on 2 effective nodes. The candidate must
 * raise it (to 4 or 5) to actually provision replacement capacity that
 * compensates for the down node. */
export const CACHE_NODE_COUNT_KEY = "cacheNodeCount";

/** How the cache layer handles the keys the failed node used to own.
 * "redistribute" (default) reshards those keys onto the surviving nodes,
 * concentrating their miss traffic. "originFallback" instead routes those
 * specific keys straight past the cache to the database on every request
 * until the node is replaced — trading cache-layer load for direct,
 * unprotected database read load. */
export const FAILOVER_MODE_KEY = "failoverMode";

/** Protects the primary database from the read spike caused by the lost
 * node's keys falling through as misses. "off" sends every miss straight
 * through. "rateLimited" caps the rate of fallback reads hitting the
 * database, shedding the excess. "coalescing" collapses concurrent misses
 * for the same key into a single database read, the clean fix for
 * redundant duplicate reads without shedding any unique key's data. */
export const DB_REQUEST_PROTECTION_KEY = "dbRequestProtection";

/** How aggressively the cache is proactively refilled after the node
 * failure (or after replacement capacity comes online). "off" lets the
 * cache repopulate lazily, one key at a time, as real traffic requests
 * it. "gradual" refills at a throttled rate. "aggressive" tries to refill
 * the entire working set as fast as possible — the trap: a large
 * aggressive refill issues a burst of near-simultaneous database reads
 * that can itself look exactly like a second incident. */
export const CACHE_WARMING_MODE_KEY = "cacheWarmingMode";

/** API-tier worker concurrency. Scaling this up increases the rate of
 * requests (and, during the incident, cache misses) the API cluster can
 * issue downstream — helpful for serving customers, but it increases
 * pressure on the database when the cache layer is not currently
 * protecting it. */
export const APPLICATION_CONCURRENCY_KEY = "applicationConcurrency";

export const controls: ControlDefinition[] = [
  { key: CACHE_NODE_COUNT_KEY, allowedValues: [2, 3, 4, 5], initialValue: 3 },
  {
    key: FAILOVER_MODE_KEY,
    allowedValues: ["redistribute", "originFallback"],
    initialValue: "redistribute",
  },
  {
    key: DB_REQUEST_PROTECTION_KEY,
    allowedValues: ["off", "rateLimited", "coalescing"],
    initialValue: "off",
  },
  {
    key: CACHE_WARMING_MODE_KEY,
    allowedValues: ["off", "gradual", "aggressive"],
    initialValue: "off",
  },
  {
    key: APPLICATION_CONCURRENCY_KEY,
    allowedValues: ["low", "medium", "high"],
    initialValue: "medium",
  },
];
