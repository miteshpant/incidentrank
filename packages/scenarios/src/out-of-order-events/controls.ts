import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How producers select a partition for each account-update event.
 * "account-id-keyed" guarantees every event for a given account lands on
 * the same partition (and is therefore processed in produce order by the
 * single consumer that owns that partition). "round-robin" spreads load
 * evenly across partitions for better throughput, but events for the same
 * account can now land on different partitions and be processed by
 * different consumers running at different speeds — breaking per-account
 * causal order.
 */
export const PARTITION_KEY_STRATEGY_KEY = "partitionKeyStrategy";

/** Number of consumer processes reading the stream. Raising this when the
 * key strategy is still account-id-keyed does nothing for ordering (each
 * account's partition is still owned by exactly one consumer) and mostly
 * just adds idle capacity. Raising it alongside round-robin keying
 * increases how many independently-scheduled consumers can race to write
 * the same account's materialized state. */
export const CONSUMER_PARALLELISM_KEY = "consumerParallelism";

/** An in-consumer buffer that holds recently-arrived events for a short
 * window and releases them to the materialized-state writer in sequence-
 * number order rather than arrival order. Absorbs cross-partition
 * reordering for an account whose events spread across partitions, at the
 * cost of added per-event processing latency. */
export const REORDER_BUFFER_ENABLED_KEY = "reorderBufferEnabled";

/**
 * Whether each consumer checks an event's sequence number against the
 * materialized state's currently recorded sequence number before writing,
 * rejecting (and queuing for reconciliation) any event that would move an
 * account's state backward. Without this, a late-arriving but logically
 * older event can silently overwrite a newer one.
 */
export const SEQUENCE_VALIDATION_ENABLED_KEY = "sequenceValidationEnabled";

/**
 * How long a consumer is willing to hold a received-out-of-sequence event
 * before giving up and either reconciling it out-of-band or applying it
 * anyway, depending on sequenceValidationEnabled. A longer tolerance
 * window gives more cross-partition skew time to resolve itself before
 * the consumer has to make a tradeoff call, but adds end-to-end
 * materialization latency.
 */
export const DELAYED_PROCESSING_TOLERANCE_KEY = "delayedProcessingToleranceMs";

export const controls: ControlDefinition[] = [
  {
    key: PARTITION_KEY_STRATEGY_KEY,
    allowedValues: ["account-id-keyed", "round-robin"],
    // The incident's own cause: the routing change already rolled out
    // round-robin keying before the candidate's attempt begins. Re-keying
    // to "account-id-keyed" is the candidate's strong-recovery action,
    // not the pre-incident default.
    initialValue: "round-robin",
  },
  {
    key: CONSUMER_PARALLELISM_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: REORDER_BUFFER_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: SEQUENCE_VALIDATION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: DELAYED_PROCESSING_TOLERANCE_KEY,
    allowedValues: [0, 500, 5_000],
    initialValue: 0,
  },
];
