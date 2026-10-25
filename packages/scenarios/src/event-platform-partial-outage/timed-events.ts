import type { TimedEvent } from "@incidentrank/simulator";

// All three root causes begin within the same narrow window, close
// enough to read as simultaneous to the candidate, but authored as
// three genuinely independent triggers so each can be diagnosed and
// fixed on its own schedule rather than collapsing into one incident.

// One broker partition class (the one backing Topic B and Topic C —
// Topic A's partitions sit on a separate, currently-healthy partition
// class) becomes degraded. Overall broker health reads ambiguous
// (partially degraded, not fully down) rather than a clean outage.
const BROKER_PARTITION_DEGRADED_MS = 20_000;

// Consumer Group B develops growing lag against Topic B — a genuinely
// separate root cause (a slow downstream write pattern inside Group
// B's own processing path), not merely a consequence of the broker
// problem.
const CONSUMER_B_LAG_ONSET_MS = 25_000;

// Consumer Group C begins retrying aggressively against its downstream
// DB/API, which is itself independently degraded — a third, genuinely
// separate root cause.
const CONSUMER_C_RETRY_STORM_MS = 30_000;

// Recovery-lag window for the broker partition class: once it has been
// isolated (so the degraded class's own replication/ISR traffic stops
// contending with healthy partition classes), the partition class
// itself still needs real elapsed time to drain its replication
// backlog and return to full health — never instantaneous.
const BROKER_RECOVERY_WINDOW_ELAPSED_MS = BROKER_PARTITION_DEGRADED_MS + 3 * 60_000;

// Recovery-lag window for Consumer Group B: once concurrency relief is
// genuinely applied (without having transferred pressure downstream),
// Group B's lag still takes real elapsed time to drain rather than
// snapping to zero on the tick the control changed.
const CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS = CONSUMER_B_LAG_ONSET_MS + 2 * 60_000;

// Recovery-lag window for the downstream DB/API: once retry pressure
// from Consumer Group C (and any other group hammering it) is
// genuinely brought under control, the downstream dependency itself
// still needs real elapsed time to recover rather than healing the
// instant the retry mode changes.
const DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS = CONSUMER_C_RETRY_STORM_MS + 2 * 60_000 + 30_000;

// Historical-damage exposure window (phase6d.2 section 9): the broker
// partition class's degradation, combined with an unsafe
// (unisolated + large-batch) configuration and Consumer Group C's
// retry storm, takes real elapsed time to actually bleed into Topic
// A's own partition class and cause durable drops — this is not an
// instantaneous one-tick accident. rules.ts's contamination rule only
// matches once this window has elapsed with the unsafe combination
// still in effect; a candidate who corrects
// PARTITION_ISOLATION_KEY/BATCH_SIZE_KEY before this window closes
// never contaminates Topic A at all.
const TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS = BROKER_PARTITION_DEGRADED_MS + 70_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "broker-partition-degraded",
    atMs: BROKER_PARTITION_DEGRADED_MS,
    type: "TRIGGER_SET",
    message:
      "The broker partition class backing Topic B and Topic C has degraded. Topic A's partitions sit on a separate, currently-healthy partition class. Overall broker health reads ambiguous rather than fully down.",
    setTriggers: { brokerPartitionDegraded: true },
  },
  {
    id: "consumer-b-lag-onset",
    atMs: CONSUMER_B_LAG_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "Consumer Group B's processing lag against Topic B is growing — an independent root cause inside Group B's own processing path, not merely a symptom of the broker problem.",
    setTriggers: { brokerPartitionDegraded: true, consumerBLagging: true },
  },
  {
    id: "consumer-c-retry-storm",
    atMs: CONSUMER_C_RETRY_STORM_MS,
    type: "TRIGGER_SET",
    message:
      "Consumer Group C is retrying aggressively against its downstream DB/API, which is itself independently degraded — a third, separate root cause.",
    setTriggers: {
      brokerPartitionDegraded: true,
      consumerBLagging: true,
      consumerCRetryStorm: true,
    },
  },
  // NOTE: ordered strictly by ascending atMs — tickOnce processes
  // timedEvents purely by array position, never by sorting atMs itself.
  {
    id: "topic-a-exposure-window-elapsed",
    atMs: TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "The broker partition degradation has persisted long enough that, if the degraded class was ever left unisolated under heavy batch load and Consumer Group C's retry storm, real Topic A drops would already have occurred.",
    setTriggers: {
      brokerPartitionDegraded: true,
      consumerBLagging: true,
      consumerCRetryStorm: true,
      topicAExposureWindowElapsed: true,
    },
  },
  {
    id: "consumer-b-drain-window-elapsed",
    atMs: CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for Consumer Group B to fully drain its backlog, provided genuine concurrency relief was applied without transferring pressure downstream.",
    setTriggers: {
      brokerPartitionDegraded: true,
      consumerBLagging: true,
      consumerCRetryStorm: true,
      topicAExposureWindowElapsed: true,
      consumerBDrainWindowElapsed: true,
    },
  },
  {
    id: "downstream-recovery-window-elapsed",
    atMs: DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for the downstream DB/API to fully recover, provided retry/call pressure against it was genuinely brought under control.",
    setTriggers: {
      brokerPartitionDegraded: true,
      consumerBLagging: true,
      consumerCRetryStorm: true,
      topicAExposureWindowElapsed: true,
      consumerBDrainWindowElapsed: true,
      downstreamRecoveryWindowElapsed: true,
    },
  },
  {
    id: "broker-recovery-window-elapsed",
    atMs: BROKER_RECOVERY_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for the broker partition class to fully drain its replication backlog, provided it has actually been isolated from contending traffic.",
    setTriggers: {
      brokerPartitionDegraded: true,
      consumerBLagging: true,
      consumerCRetryStorm: true,
      topicAExposureWindowElapsed: true,
      consumerBDrainWindowElapsed: true,
      downstreamRecoveryWindowElapsed: true,
      brokerRecoveryWindowElapsed: true,
    },
  },
];

export {
  BROKER_PARTITION_DEGRADED_MS,
  CONSUMER_B_LAG_ONSET_MS,
  CONSUMER_C_RETRY_STORM_MS,
  TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS,
  BROKER_RECOVERY_WINDOW_ELAPSED_MS,
  CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
  DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
};
