import type { ControlDefinition } from "@incidentrank/simulator";

/** The real correctness fix: consumers check an idempotency key (derived
 * from the event's unique id) before applying a payment/order side
 * effect, so a redelivered copy of an event already applied is
 * recognized and skipped rather than re-applied. */
export const IDEMPOTENT_PROCESSING_ENABLED_KEY = "idempotentProcessingEnabled";

/** A bounded window (in seconds) the consumer remembers recently-applied
 * event ids for, to actually recognize a redelivered duplicate. Without
 * idempotent processing enabled, widening this window has no effect —
 * there is nothing yet checking it against. */
export const DEDUPLICATION_WINDOW_SECONDS_KEY = "deduplicationWindowSeconds";

/** How long a consumer waits for a broker acknowledgement before treating
 * the message as unacked and letting it be redelivered. Lowering this
 * aggressively while the broker is already slow to receive acks makes
 * the consumer give up and trigger MORE spurious redeliveries, not
 * fewer — the trap: it looks proactive but amplifies the real problem. */
export const ACK_TIMEOUT_MS_KEY = "ackTimeoutMs";

/** Maximum times the broker will redeliver an unacked message before
 * routing it to a dead-letter path instead. Raising this while
 * acknowledgements are already failing multiplies how many times each
 * affected event's side effect can be reapplied. */
export const MAX_REDELIVERY_ATTEMPTS_KEY = "maxRedeliveryAttempts";

/** Number of parallel consumer processes pulling from the broker. Raising
 * this increases throughput and can look like it is "handling the load"
 * better, but it does nothing to recognize or suppress a redelivered
 * duplicate — more consumers just means more processes capable of
 * re-applying the same duplicate event concurrently. */
export const CONSUMER_CONCURRENCY_KEY = "consumerConcurrency";

export const controls: ControlDefinition[] = [
  {
    key: IDEMPOTENT_PROCESSING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: DEDUPLICATION_WINDOW_SECONDS_KEY,
    allowedValues: [0, 30, 120, 600],
    initialValue: 0,
  },
  {
    key: ACK_TIMEOUT_MS_KEY,
    allowedValues: [200, 1_000, 5_000, 15_000],
    initialValue: 5_000,
  },
  {
    key: MAX_REDELIVERY_ATTEMPTS_KEY,
    allowedValues: [1, 3, 8, 20],
    initialValue: 3,
  },
  {
    key: CONSUMER_CONCURRENCY_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
];
