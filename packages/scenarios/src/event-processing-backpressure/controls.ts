import type { ControlDefinition } from "@incidentrank/simulator";

/** Throttles the producer side's ingestion rate into Kafka. Buys time by
 * slowing the inflow, but does nothing to increase how fast the
 * processing layer drains the existing backlog — left on by itself,
 * event freshness never recovers. */
export const PRODUCER_THROTTLE_ENABLED_KEY = "producerThrottleEnabled";

/** Thread-pool concurrency inside the processing layer per consumer.
 * Raising this increases how many events each consumer instance can work
 * on at once — which also means more concurrent database writes and more
 * concurrent external-API calls per consumer, not just faster Kafka
 * draining. */
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";

/** Number of Kafka consumer instances pulling from the topic. More
 * consumers drain Kafka lag faster, but each one independently opens
 * database connections and makes external-API calls — this is the
 * scenario's central pressure-transfer lever. */
export const CONSUMER_COUNT_KEY = "consumerCount";

/** Events processed per batch pulled from Kafka. A larger batch reduces
 * per-batch overhead and database round-trips (one bulk write instead of
 * many), at the cost of each batch taking longer and each external-API
 * call inside it staying more synchronous/serialized. */
export const BATCH_SIZE_KEY = "batchSize";

/** Concurrency ceiling for outbound calls to the external API from the
 * processing layer. Raising this alongside more consumers/workers
 * increases external-API request volume directly — if the external
 * API's own rate limits are exceeded, its error rate climbs. */
export const EXTERNAL_API_CALL_CONCURRENCY_KEY = "externalApiCallConcurrency";

/** When enabled, high-priority events are processed and written through
 * first; lower-priority events are deliberately delayed rather than
 * competing equally for the same database/external-API capacity. Trades
 * some low-priority freshness for protecting the core path under
 * pressure. */
export const PRIORITY_ROUTING_ENABLED_KEY = "priorityRoutingEnabled";

export const controls: ControlDefinition[] = [
  {
    key: PRODUCER_THROTTLE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: WORKER_CONCURRENCY_KEY,
    allowedValues: [10, 20, 40, 80],
    initialValue: 10,
  },
  {
    key: CONSUMER_COUNT_KEY,
    allowedValues: [2, 4, 8, 16],
    initialValue: 2,
  },
  {
    key: BATCH_SIZE_KEY,
    allowedValues: [50, 200, 500],
    initialValue: 200,
  },
  {
    key: EXTERNAL_API_CALL_CONCURRENCY_KEY,
    allowedValues: [5, 15, 30, 60],
    initialValue: 15,
  },
  {
    key: PRIORITY_ROUTING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
