import type { ControlDefinition } from "@incidentrank/simulator";

/** API-layer horizontal scaling. Per the scenario's binding design
 * requirement, the real constraint is downstream (the database connection
 * pool, starved by a collapsed cache hit rate) — adding API instances only
 * means more concurrent requests reaching the same exhausted pool, which
 * worsens database contention rather than relieving it. */
export const API_INSTANCE_COUNT_KEY = "apiInstanceCount";

/** Database connection pool ceiling. Raising it while the cache is still
 * cold lets more concurrent cache-miss queries run against the database at
 * once — it widens the pipe into an already-saturated database rather than
 * reducing how much traffic actually reaches it. */
export const DB_CONNECTION_POOL_SIZE_KEY = "dbConnectionPoolSize";

/** Database-side protection: a strict statement-timeout/admission mode
 * sheds slow or queued queries quickly instead of letting them pile up and
 * hold connections indefinitely, directly protecting the pool from the
 * cache-miss flood. The real downstream fix lever. */
export const DB_PROTECTION_MODE_KEY = "dbProtectionMode";

/** Cache TTL/key behavior under the new traffic pattern. The spike's
 * traffic mix skews toward keys the default short TTL evicts before reuse;
 * extending TTL (and widening the key set the cache will serve stale-but-
 * acceptable data for) raises hit rate and keeps load off the database.
 * The other real downstream fix lever. */
export const CACHE_BEHAVIOR_KEY = "cacheBehaviorMode";

/** Bounds how many in-flight requests the API fleet will hold concurrently
 * before queuing/rejecting new ones at the edge, rather than forwarding
 * unbounded concurrency straight through to the database. */
export const REQUEST_QUEUE_MODE_KEY = "requestQueueMode";

/** Rate-limits incoming client traffic directly. Genuinely reduces load
 * reaching every downstream component, at the direct cost of throttling
 * legitimate (non-malicious) customer requests during the spike. */
export const RATE_LIMIT_MODE_KEY = "rateLimitMode";

/** Temporarily disables a non-critical, read-heavy reporting endpoint that
 * is not required for core checkout/account flows, trading that feature's
 * availability for immediate relief on both the cache and the database. */
export const NON_CRITICAL_ENDPOINT_ENABLED_KEY = "nonCriticalEndpointEnabled";

export const controls: ControlDefinition[] = [
  {
    key: API_INSTANCE_COUNT_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: DB_CONNECTION_POOL_SIZE_KEY,
    allowedValues: [20, 50, 100, 200],
    initialValue: 20,
  },
  {
    key: DB_PROTECTION_MODE_KEY,
    allowedValues: ["relaxed", "strict"],
    initialValue: "relaxed",
  },
  {
    key: CACHE_BEHAVIOR_KEY,
    allowedValues: ["shortTtl", "extendedTtl"],
    initialValue: "shortTtl",
  },
  {
    key: REQUEST_QUEUE_MODE_KEY,
    allowedValues: ["unbounded", "bounded"],
    initialValue: "unbounded",
  },
  {
    key: RATE_LIMIT_MODE_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: NON_CRITICAL_ENDPOINT_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: true,
  },
];
