import type { ControlDefinition } from "@incidentrank/simulator";

/** Provisioned cache memory, as a multiple of the pre-incident baseline.
 * Raising this gives the cache more room before it has to evict anything
 * — genuine, real relief. But per the scenario's required distinction,
 * the deployment also changed what is being cached (larger objects, far
 * more distinct keys): memory alone does not change how much useful work
 * each byte of cache buys, so even a large increase only pushes the same
 * churn out to a bigger working set rather than removing it. */
export const CACHE_MEMORY_MULTIPLIER_KEY = "cacheMemoryMultiplier";

/** Time-to-live for cached entries. A shorter TTL evicts proactively
 * before memory pressure forces it, trading hit ratio for freshness. A
 * longer TTL keeps entries around longer but does nothing about memory-
 * pressure evictions once the working set no longer fits regardless of
 * TTL. */
export const CACHE_TTL_KEY = "cacheTtlSeconds";

/** What shape gets cached. "fullObject" (pre-incident default) caches the
 * entire response object as-is — after the deployment this means caching
 * the new, much larger payload in full. "projectedFields" caches only
 * the specific fields the read path actually needs, shrinking the
 * per-entry footprint back down regardless of how large the source
 * object has become — the real policy-side fix for an object-size
 * change. */
export const OBJECT_CACHING_POLICY_KEY = "objectCachingPolicy";

/** Which entries are admitted into the cache at all. "admitAll"
 * (pre-incident default) caches every key it sees, including the long
 * tail of now much-more-numerous distinct keys that will likely never be
 * reused before they'd be evicted anyway. "sizeAwareAdmission" rejects
 * low-reuse-value entries (oversized objects, keys outside the hot working
 * set) up front, protecting cache space for entries that will actually be
 * hit again — the real policy-side fix for a cardinality change. */
export const CACHE_ADMISSION_POLICY_KEY = "cacheAdmissionPolicy";

/** API-tier worker concurrency. Scaling this up increases the rate of
 * requests (and, during the incident, cache misses) the API cluster can
 * issue downstream — it does not change the cache's hit ratio and can
 * increase pressure on an already-struggling database. */
export const API_CONCURRENCY_KEY = "apiConcurrency";

/** Protects the database from the read load created by cache misses.
 * "off" sends every miss straight through. "rateLimited" caps the rate of
 * read traffic reaching the database, shedding the excess. "coalescing"
 * (request coalescing) collapses concurrent misses for the same key into
 * a single database read — a clean reduction in redundant load without
 * shedding any unique key's data. */
export const DB_PROTECTION_KEY = "dbProtection";

export const controls: ControlDefinition[] = [
  { key: CACHE_MEMORY_MULTIPLIER_KEY, allowedValues: [1, 2, 4, 8], initialValue: 1 },
  { key: CACHE_TTL_KEY, allowedValues: [60, 300, 900, 3_600], initialValue: 900 },
  {
    key: OBJECT_CACHING_POLICY_KEY,
    allowedValues: ["fullObject", "projectedFields"],
    initialValue: "fullObject",
  },
  {
    key: CACHE_ADMISSION_POLICY_KEY,
    allowedValues: ["admitAll", "sizeAwareAdmission"],
    initialValue: "admitAll",
  },
  {
    key: API_CONCURRENCY_KEY,
    allowedValues: ["low", "medium", "high"],
    initialValue: "medium",
  },
  {
    key: DB_PROTECTION_KEY,
    allowedValues: ["off", "rateLimited", "coalescing"],
    initialValue: "off",
  },
];
