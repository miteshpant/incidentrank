import type { ControlDefinition } from "@incidentrank/simulator";

/** Producer-side backpressure/throttling into the Event Gateway. Slows
 * ingestion into the already-degraded broker partition class, buying
 * time, but does nothing on its own to drain Consumer Group B's lag or
 * stop Consumer Group C's retry storm against the downstream
 * dependency — those are separate failure domains with their own
 * levers. */
export const PRODUCER_BACKPRESSURE_KEY = "producerBackpressureEnabled";

/** Declares Topic A's business priority and reserves broker capacity
 * for it ahead of Topic B/Topic C. Topic A's partitions sit on a
 * separate, currently-healthy partition class from the one that
 * degraded — this control's real job is making sure neither Topic B's
 * backlog nor Topic C's retry volume is ever allowed to crowd out
 * Topic A's broker-side write/replication capacity if contention
 * increases. */
export const TOPIC_A_PRIORITY_KEY = "topicAPriority";

/** Partition isolation for the degraded broker partition class.
 * "isolated" fences the degraded partition class's own replication/
 * ISR traffic away from the healthy partition classes (including Topic
 * A's), so a worsening broker problem cannot bleed into topics that
 * were never part of the degradation. This is a BROKER-level lever —
 * it does nothing about Consumer Group B's own lag or Consumer Group
 * C's retry volume. */
export const PARTITION_ISOLATION_KEY = "partitionIsolationMode";

/** Consumer Group B's concurrency (parallel consumer instances pulling
 * from Topic B). Raising this drains Topic B's lag faster, but Group
 * B's downstream writes land on the same shared downstream systems
 * Consumer Group C already hits — scaling Group B blindly adds more
 * concurrent load to a dependency that may already be under retry
 * pressure from Group C. */
export const CONSUMER_B_CONCURRENCY_KEY = "consumerBConcurrency";

/** Governs how Consumer Group C treats failures calling the degraded
 * downstream DB/API: "aggressive" retries immediately and
 * unconditionally (the retry-storm default); "bounded" caps retry
 * attempts with backoff before routing to the DLQ; "circuit-breaker"
 * stops new calls outright once the downstream's own error rate
 * crosses an unsafe threshold, giving it room to recover. This is the
 * retry-ownership lever for Group C specifically — it has no effect on
 * Group B's lag or the broker partition problem. */
export const CONSUMER_C_RETRY_MODE_KEY = "consumerCRetryMode";

/** Protects the degraded downstream DB/API directly, independent of
 * which consumer group is calling it. "on" caps aggregate outbound
 * call concurrency across all consumer groups into the downstream
 * systems once the downstream's error rate is elevated. This is a
 * downstream-side lever, distinct from (and complementary to) Consumer
 * Group C's own retry mode. */
export const DOWNSTREAM_CIRCUIT_BREAKER_KEY = "downstreamCircuitBreaker";

/** Dead-letter-queue policy for events that exhaust their retry budget.
 * "enabled" routes genuinely-exhausted events to a durable DLQ for
 * later reprocessing — never discarded. "disabled" (the default) means
 * exhausted events currently have nowhere safe to go once a bounded
 * retry policy is applied; combining bounded retries with a disabled
 * DLQ is what actually drops events rather than merely delaying them. */
export const DLQ_POLICY_KEY = "dlqPolicy";

/** Batch size for broker reads/writes. Larger batches reduce per-batch
 * overhead but each batch holds the degraded partition class's
 * replication path open longer per request, worsening broker pressure
 * exactly when the partition class is already degraded. */
export const BATCH_SIZE_KEY = "batchSize";

export const controls: ControlDefinition[] = [
  { key: PRODUCER_BACKPRESSURE_KEY, allowedValues: [false, true], initialValue: false },
  { key: TOPIC_A_PRIORITY_KEY, allowedValues: ["normal", "protected"], initialValue: "normal" },
  {
    key: PARTITION_ISOLATION_KEY,
    allowedValues: ["unisolated", "isolated"],
    initialValue: "unisolated",
  },
  { key: CONSUMER_B_CONCURRENCY_KEY, allowedValues: [2, 4, 8, 16], initialValue: 2 },
  {
    key: CONSUMER_C_RETRY_MODE_KEY,
    allowedValues: ["aggressive", "bounded", "circuit-breaker"],
    initialValue: "aggressive",
  },
  { key: DOWNSTREAM_CIRCUIT_BREAKER_KEY, allowedValues: [false, true], initialValue: false },
  { key: DLQ_POLICY_KEY, allowedValues: ["disabled", "enabled"], initialValue: "disabled" },
  { key: BATCH_SIZE_KEY, allowedValues: [100, 500, 2_000], initialValue: 500 },
];
