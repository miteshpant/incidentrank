import type { ControlDefinition } from "@incidentrank/simulator";

/** How long a worker's lock lease is valid before the Lock Service
 * considers it expired and lets another worker acquire the "same" lock.
 * Lowering this alone shortens how long a genuinely crashed worker can
 * block the shared resource, but — without lease renewal — also makes it
 * MORE likely a slow-but-alive worker's lease expires mid-processing.
 * Raising it reduces that expiry frequency, but is not the clean fix: it
 * trades correctness risk for a much slower failure-recovery window if a
 * worker actually crashes while holding the lease (see
 * resourceBlockedSeconds in metrics.ts/rules.ts). */
export const LEASE_DURATION_SECONDS_KEY = "leaseDurationSeconds";

/** Whether a worker sends a heartbeat that renews its own lease while it
 * is still actively processing. With renewal on, a genuinely alive
 * worker's lease never expires mid-task regardless of how long the task
 * runs — but a worker that crashes still holds the lease until the
 * lease's own duration elapses (renewal only extends a lease from a
 * worker that is still alive to send the heartbeat). */
export const LEASE_RENEWAL_ENABLED_KEY = "leaseRenewalEnabled";

/** The durable correctness fix: each successful lock acquisition is
 * stamped with a monotonically increasing fencing token, and the shared
 * resource rejects any write presented with a token older than the
 * highest token it has already accepted. This makes a late/duplicate
 * write from a superseded owner harmless even when a lease does expire
 * mid-processing — the old owner's write is rejected rather than
 * applied, so overlapping ownership can no longer corrupt the shared
 * resource, independent of lease duration. */
export const FENCING_TOKEN_ENABLED_KEY = "fencingTokenEnabled";

/** Number of workers concurrently pulling jobs that require the lock.
 * Higher concurrency increases lock-acquisition contention and raises
 * how often a second worker is waiting at the exact moment a lease
 * expires — it does not, by itself, cause or prevent overlapping
 * ownership. */
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";

/** Whether a worker that fails to acquire the lock backs off
 * (exponential-ish delay) before retrying, versus retrying immediately
 * in a tight loop. Immediate retry under contention creates a
 * thundering herd of acquisition attempts against the Lock Service
 * itself, raising lock-service load and contention-rate independent of
 * the underlying lease/fencing problem. */
export const ACQUIRE_RETRY_BACKOFF_ENABLED_KEY = "acquireRetryBackoffEnabled";

export const controls: ControlDefinition[] = [
  {
    key: LEASE_DURATION_SECONDS_KEY,
    allowedValues: [5, 15, 30, 60, 120],
    initialValue: 30,
  },
  {
    key: LEASE_RENEWAL_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: FENCING_TOKEN_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: WORKER_CONCURRENCY_KEY,
    allowedValues: [2, 4, 8, 16],
    initialValue: 8,
  },
  {
    key: ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
