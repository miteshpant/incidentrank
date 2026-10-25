import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The idempotency store's backing mode. "single-node" is fast but has no
 * replica to serve reads/writes from if the primary node degrades — once
 * the store's primary is unhealthy, single-node mode has nothing to fail
 * over to. "replicated" accepts a small latency cost in exchange for a
 * durable standby that keeps key lookups available through the same
 * primary-node degradation this incident introduces.
 */
export const STORAGE_MODE_KEY = "idempotencyStorageMode";

/**
 * How long (seconds) the store retains a processed idempotency key before
 * evicting it. The worker's own slowest legitimate retry/redelivery can
 * arrive well after a short TTL has already evicted the original key's
 * record — at that point the retry looks, to the store, exactly like a
 * brand-new request. Widening this past the worker's realistic retry
 * horizon is the real fix for the eviction half of this incident;
 * shortening it (e.g. to "free up store memory") actively makes eviction
 * worse.
 */
export const KEY_TTL_SECONDS_KEY = "idempotencyKeyTtlSeconds";

/**
 * How broadly an idempotency key identifies "the same request". "too-broad"
 * collapses genuinely distinct requests (e.g. two different customers'
 * orders) onto the same key, causing the store to wrongly treat a second,
 * legitimate request as a duplicate and suppress its side effect entirely.
 * "too-narrow" derives the key from fields that vary between legitimate
 * retries of the very same logical request (e.g. including a fresh
 * timestamp), so the store never recognizes two attempts at the same
 * request as the same key at all. "request-scoped" ties the key to the
 * logical request's own stable identity — neither collapsing distinct
 * requests nor failing to recognize retries of the same one.
 */
export const KEY_SCOPE_KEY = "idempotencyKeyScope";

/**
 * The worker's retry behavior when the external side-effect call's result
 * is uncertain (timeout, ambiguous response). "aggressive" retries quickly
 * and often; combined with a degraded idempotency store, every one of
 * those extra retry attempts is an extra opportunity for the broken
 * dedup check to let the side effect run again.
 */
export const RETRY_STRATEGY_KEY = "workerRetryStrategy";

/** Number of parallel worker processes pulling from the queue. Raising
 * this increases throughput but does nothing to repair the idempotency
 * store — more workers simply means more concurrent processes capable of
 * independently missing the same broken dedup check. */
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";

/**
 * What the worker does when the idempotency store itself cannot be
 * reached/queried at all. "fail-open" proceeds with the external side
 * effect anyway, assuming "probably not a duplicate" — this keeps
 * request-success and throughput metrics looking healthy, but every
 * request processed during a store outage has no safety check behind it
 * at all, and real duplicate side effects accumulate silently.
 * "fail-closed" refuses to proceed without a successful idempotency
 * check, queueing or rejecting the request instead — this costs visible
 * availability (success rate drops, queue depth rises) but guarantees no
 * side effect runs without having actually been checked.
 */
export const STORE_UNAVAILABLE_BEHAVIOR_KEY = "storeUnavailableBehavior";

export const controls: ControlDefinition[] = [
  {
    key: STORAGE_MODE_KEY,
    allowedValues: ["single-node", "replicated"],
    initialValue: "single-node",
  },
  {
    key: KEY_TTL_SECONDS_KEY,
    allowedValues: [15, 60, 300, 1_800],
    initialValue: 60,
  },
  {
    key: KEY_SCOPE_KEY,
    allowedValues: ["too-broad", "too-narrow", "request-scoped"],
    initialValue: "too-narrow",
  },
  {
    key: RETRY_STRATEGY_KEY,
    allowedValues: ["aggressive", "backoff"],
    initialValue: "aggressive",
  },
  {
    key: WORKER_CONCURRENCY_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: STORE_UNAVAILABLE_BEHAVIOR_KEY,
    allowedValues: ["fail-open", "fail-closed"],
    initialValue: "fail-open",
  },
];
