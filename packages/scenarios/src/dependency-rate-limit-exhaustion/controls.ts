import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Caches the Aggregation Service's responses so repeat lookups for the
 * same underlying data are served without a fresh call to the
 * third-party dependency. The one genuinely durable lever here: it
 * reduces call volume against the quota for the rest of the rolling
 * window, not just right now.
 */
export const CACHING_ENABLED_KEY = "cachingEnabled";

/**
 * Coalesces concurrent, identical in-flight requests into a single
 * downstream call and fans the one response back out to every waiting
 * caller, instead of each request independently hitting the dependency.
 * Reduces call volume during request bursts without needing a cache.
 */
export const REQUEST_COALESCING_ENABLED_KEY = "requestCoalescingEnabled";

/**
 * Retry behavior applied to failed (429) downstream calls. "off" never
 * retries a 429. "normal" retries a bounded number of times with
 * backoff. "aggressive" retries immediately and repeatedly. Per the
 * scenario's binding design requirement: against a HARD quota, every
 * retry attempt is itself another request counted against the same
 * rolling window — "aggressive" retries while 429s are already
 * occurring burn through the remaining quota faster than doing nothing,
 * exhausting it completely before the window resets.
 */
export const RETRY_AGGRESSIVENESS_KEY = "retryAggressiveness";

/**
 * Once quota is tight, restricts downstream calls to requests tagged
 * high-priority, deferring/dropping lower-priority lookups rather than
 * contending for the same shrinking quota on equal terms.
 */
export const PRIORITY_TRAFFIC_POLICY_KEY = "priorityTrafficPolicy";

/**
 * Suppresses a non-critical enrichment feature that calls the
 * dependency on every request (e.g. an optional metadata lookup).
 * Removing that call volume relieves quota pressure immediately, at the
 * cost of that enrichment being unavailable to customers for as long as
 * it stays off.
 */
export const OPTIONAL_FEATURE_SUPPRESSED_KEY = "optionalFeatureSuppressed";

/**
 * Caps how many requests the Aggregation Service may have in flight to
 * the dependency at once. Lower concurrency smooths bursts and slightly
 * reduces total call volume by naturally queueing excess demand instead
 * of firing it all at the dependency; it does not, by itself, change
 * whether retries are aggressive.
 */
export const DEPENDENCY_CONCURRENCY_KEY = "dependencyConcurrency";

export const controls: ControlDefinition[] = [
  {
    key: CACHING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REQUEST_COALESCING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: RETRY_AGGRESSIVENESS_KEY,
    allowedValues: ["off", "normal", "aggressive"],
    initialValue: "normal",
  },
  {
    key: PRIORITY_TRAFFIC_POLICY_KEY,
    allowedValues: ["all-equal", "priority-only"],
    initialValue: "all-equal",
  },
  {
    key: OPTIONAL_FEATURE_SUPPRESSED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: DEPENDENCY_CONCURRENCY_KEY,
    allowedValues: ["high", "capped"],
    initialValue: "high",
  },
];
