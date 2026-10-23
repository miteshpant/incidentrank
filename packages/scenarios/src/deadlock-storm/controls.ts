import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The real fix: whether Order Service and Inventory Service acquire row
 * locks on the shared orders/inventory tables in a consistent order.
 * "legacy" is the post-deployment bug — the two services lock in opposite
 * order, so concurrent checkouts can each hold one resource while waiting
 * on the other, deadlocking. "canonical" enforces a single, agreed lock
 * acquisition order across both services, which removes the circular-wait
 * condition entirely rather than reacting to it after the fact.
 */
export const TRANSACTION_LOCK_ORDERING_KEY = "transactionLockOrdering";

/**
 * How aggressively a transaction that lost a deadlock retries. "aggressive"
 * retries immediately and without bound — exactly the lever the design
 * requirement calls out: more retry attempts against an unresolved
 * lock-order conflict means more concurrent lock acquisition attempts,
 * which increases (not decreases) deadlock frequency and lock wait time.
 * "bounded" retries a small fixed number of times before surfacing a
 * checkout failure. "off" never retries a deadlocked transaction.
 */
export const DEADLOCK_RETRY_POLICY_KEY = "deadlockRetryPolicy";

/**
 * Spacing between retry attempts. "fixed" retries on a tight fixed
 * interval, which synchronizes retries from many failed transactions into
 * repeated collision waves. "exponential" spreads retries out, reducing
 * (but not eliminating) the chance that many retried transactions collide
 * again at the same instant.
 */
export const RETRY_BACKOFF_KEY = "retryBackoff";

/**
 * How much a single transaction holds locked at once. "broad" locks the
 * full order row set and related inventory rows for the whole checkout
 * transaction's duration. "narrow" acquires and releases locks on the
 * smallest necessary row set, shrinking the window during which two
 * services can be holding conflicting locks simultaneously.
 */
export const TRANSACTION_SCOPE_KEY = "transactionScope";

/**
 * Concurrent workers per service issuing checkout/inventory transactions
 * against PostgreSQL. Raising this increases throughput when there is no
 * lock-order conflict, but — per the design requirement — increases
 * contention (and therefore deadlocks/sec) when the underlying lock-order
 * conflict has not been removed.
 */
export const SERVICE_CONCURRENCY_KEY = "serviceConcurrency";

/**
 * Emergency valve: temporarily serializes all order/inventory writes
 * through a single lane (effectively removing concurrency on the
 * contended tables), which eliminates deadlocks by construction at the
 * cost of severely reduced checkout throughput. A legitimate short-term
 * mitigation while the lock-ordering fix is rolled out, not a permanent
 * answer.
 */
export const WRITE_SERIALIZATION_KEY = "writeSerialization";

export const controls: ControlDefinition[] = [
  {
    key: TRANSACTION_LOCK_ORDERING_KEY,
    allowedValues: ["legacy", "canonical"],
    initialValue: "legacy",
  },
  {
    key: DEADLOCK_RETRY_POLICY_KEY,
    allowedValues: ["off", "bounded", "aggressive"],
    initialValue: "aggressive",
  },
  {
    key: RETRY_BACKOFF_KEY,
    allowedValues: ["fixed", "exponential"],
    initialValue: "fixed",
  },
  {
    key: TRANSACTION_SCOPE_KEY,
    allowedValues: ["broad", "narrow"],
    initialValue: "broad",
  },
  {
    key: SERVICE_CONCURRENCY_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 8,
  },
  {
    key: WRITE_SERIALIZATION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
