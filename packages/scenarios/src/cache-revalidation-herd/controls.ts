import type { ControlDefinition } from "@incidentrank/simulator";

/** The real preventative fix: randomizes each cached object's expiry
 * instead of a single flat TTL shared by every object, so the fleet's
 * popular objects stop expiring in the same instant. Does not change how
 * any individual refresh is served — it removes the synchronized trigger
 * that causes every instance to race for the same keys at once. */
export const TTL_JITTER_ENABLED_KEY = "ttlJitterEnabled";

/** Collapses concurrent same-key cache misses, fleet-wide, into exactly
 * one real origin refresh per key — every other instance's miss for that
 * key waits on the single in-flight refresh's result instead of issuing
 * its own. The other real durable fix: it does not touch the shared
 * expiry, but it removes the per-instance racing that turns one expiry
 * into N origin requests. */
export const SINGLE_FLIGHT_COALESCING_KEY = "singleFlightCoalescingEnabled";

/** Serves the stale cached value to callers immediately while a single
 * background refresh repopulates the key, rather than blocking any
 * caller on a synchronous origin fetch. A genuine alternate fix: it
 * avoids ever putting callers in the miss/refresh path at all, as long
 * as staleness itself is acceptable for these objects. */
export const STALE_WHILE_REVALIDATE_ENABLED_KEY = "staleWhileRevalidateEnabled";

/** Ceiling on how many refresh requests may be in flight to origin at
 * once, cache-wide. Per the scenario's binding design requirement,
 * raising this without coalescing/jitter/SWR does not reduce the number
 * of API instances independently racing to refill the same expired
 * keys — it only raises how many of those simultaneous, duplicate
 * refreshes origin is allowed to receive at once. */
export const REFRESH_CONCURRENCY_LIMIT_KEY = "refreshConcurrencyLimit";

/** How many API fleet instances are running. Per the scenario's binding
 * design requirement, more instances means more independent cache
 * clients each capable of detecting the same miss and issuing their own
 * refresh — raising this without coalescing/jitter/SWR increases, not
 * decreases, simultaneous origin load for the same popular keys. */
export const API_INSTANCE_COUNT_KEY = "apiInstanceCount";

/** How long a failed/timed-out refresh waits before retrying. A short,
 * aggressive backoff lets failed refreshes pile back onto an already-
 * saturated origin almost immediately, amplifying the exact load that
 * caused them to fail in the first place. */
export const REFRESH_RETRY_BACKOFF_KEY = "refreshRetryBackoffMs";

export const controls: ControlDefinition[] = [
  { key: TTL_JITTER_ENABLED_KEY, allowedValues: [false, true], initialValue: false },
  { key: SINGLE_FLIGHT_COALESCING_KEY, allowedValues: [false, true], initialValue: false },
  { key: STALE_WHILE_REVALIDATE_ENABLED_KEY, allowedValues: [false, true], initialValue: false },
  { key: REFRESH_CONCURRENCY_LIMIT_KEY, allowedValues: [20, 50, 100, 400], initialValue: 20 },
  { key: API_INSTANCE_COUNT_KEY, allowedValues: [6, 12, 24, 48], initialValue: 6 },
  { key: REFRESH_RETRY_BACKOFF_KEY, allowedValues: [200, 1_000, 5_000, 15_000], initialValue: 1_000 },
];
