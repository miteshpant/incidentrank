import type { ControlDefinition } from "@incidentrank/simulator";

export const RETRY_COUNT_KEY = "retryCount";
export const BACKOFF_STRATEGY_KEY = "backoffStrategy";
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";
export const WORKER_COUNT_KEY = "workerCount";
export const DLQ_THRESHOLD_KEY = "dlqThreshold";
export const CIRCUIT_BREAKER_KEY = "circuitBreaker";

export const controls: ControlDefinition[] = [
  // Per-message retry attempts before a message is either dropped back to
  // the broker for later redelivery or routed to the DLQ (see
  // DLQ_THRESHOLD_KEY). Unbounded (999) is the authored trap value: every
  // failed call against the degraded dependency gets retried effectively
  // forever, each retry re-entering the same at-least-once redelivery path.
  { key: RETRY_COUNT_KEY, allowedValues: [1, 3, 10, 999], initialValue: 10 },
  // How spaced out consecutive retry attempts for the same message are.
  // "none" fires retries back-to-back; "exponential" spreads them out,
  // reducing how much instantaneous request volume any one retrying
  // message contributes to the downstream dependency.
  {
    key: BACKOFF_STRATEGY_KEY,
    allowedValues: ["none", "fixed", "exponential"],
    initialValue: "none",
  },
  // In-flight downstream calls each individual worker process will run
  // concurrently. Higher concurrency means each worker fires more
  // simultaneous requests at the dependency per unit time.
  { key: WORKER_CONCURRENCY_KEY, allowedValues: [2, 4, 8, 16], initialValue: 4 },
  // Number of worker processes pulling from the broker. This is the
  // authored scaling trap: adding workers while the downstream dependency
  // is degraded and retries are unbounded does not add processing
  // capacity for the dependency — it adds more independent sources of
  // retry traffic against a dependency that cannot absorb more load,
  // multiplying amplification instead of draining the backlog.
  { key: WORKER_COUNT_KEY, allowedValues: [2, 4, 8, 16], initialValue: 4 },
  // After this many consecutive failures for the same message, route it
  // to the dead-letter queue instead of continuing to redeliver it. "off"
  // (999999) means nothing is ever dead-lettered — failing messages are
  // redelivered indefinitely, growing the broker-visible backlog forever.
  { key: DLQ_THRESHOLD_KEY, allowedValues: [3, 10, 999_999], initialValue: 999_999 },
  // Trips open once the downstream dependency's error rate crosses an
  // internal threshold, short-circuiting new calls (and therefore new
  // retries) to it for a cooldown window instead of letting every worker
  // keep hammering a dependency that is already failing most requests.
  { key: CIRCUIT_BREAKER_KEY, allowedValues: ["off", "on"], initialValue: "off" },
];
