import type { ControlDefinition } from "@incidentrank/simulator";

/** The real fix: scopes retry/circuit-breaking decisions to each
 * destination individually rather than treating the dispatcher's retry
 * queue as one shared pool. Once enabled, destinations whose failure
 * rate crosses an internal threshold are short-circuited on their own —
 * their retries stop consuming shared worker/queue capacity — while
 * every other destination keeps being dispatched normally. This is the
 * scenario's binding design requirement: isolating the failing subset
 * must contain the storm without degrading delivery to the healthy
 * majority. */
export const DESTINATION_ISOLATION_ENABLED_KEY = "destinationIsolationEnabled";

/** Maximum attempts the dispatcher makes per webhook before giving up
 * and routing it to the DLQ. Unbounded (999) is the authored trap:
 * every delivery to an unreachable destination gets retried
 * effectively forever, each attempt consuming a worker slot that could
 * have dispatched to a healthy destination instead. */
export const MAX_RETRY_ATTEMPTS_KEY = "maxRetryAttempts";

/** Delay between consecutive retry attempts for the same webhook.
 * "none" fires retries back-to-back, maximizing how much concurrent
 * worker time failing destinations consume per unit time; "exponential"
 * spreads retries out, reducing (but not eliminating, without
 * isolation) how much of the shared pool a failing destination
 * occupies at any one instant. */
export const RETRY_BACKOFF_KEY = "retryBackoff";

/** Total concurrent in-flight deliveries the dispatcher fleet will run
 * at once, shared across every destination. Per this scenario's design
 * requirement: raising this while a subset of destinations is
 * unreachable does not add usable delivery capacity for the healthy
 * majority — it adds more concurrent slots that retries against
 * unreachable destinations can occupy, without isolation to stop them
 * from doing so. */
export const DISPATCHER_CONCURRENCY_KEY = "dispatcherConcurrency";

/** Number of dispatcher worker processes. The same scaling trap as
 * concurrency, at the fleet level: more workers pulling from the same
 * shared delivery queue does not shrink the amount of retry work the
 * failing destinations are generating, so without isolation it still
 * does not prevent healthy-destination delivery from degrading. */
export const WORKER_COUNT_KEY = "workerCount";

/** After this many consecutive failed attempts for a given webhook, it
 * is moved to the dead-letter queue instead of continuing to occupy a
 * retry slot. "off" (999999) means a failing webhook is redelivered
 * indefinitely rather than ever being parked for later inspection. */
export const DLQ_ESCALATION_THRESHOLD_KEY = "dlqEscalationThreshold";

export const controls: ControlDefinition[] = [
  {
    key: DESTINATION_ISOLATION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: MAX_RETRY_ATTEMPTS_KEY,
    allowedValues: [3, 8, 999],
    initialValue: 8,
  },
  {
    key: RETRY_BACKOFF_KEY,
    allowedValues: ["none", "fixed", "exponential"],
    initialValue: "none",
  },
  {
    key: DISPATCHER_CONCURRENCY_KEY,
    allowedValues: [50, 100, 200, 400],
    initialValue: 100,
  },
  {
    key: WORKER_COUNT_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: DLQ_ESCALATION_THRESHOLD_KEY,
    allowedValues: [5, 20, 999_999],
    initialValue: 999_999,
  },
];
