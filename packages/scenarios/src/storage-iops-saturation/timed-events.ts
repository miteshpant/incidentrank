import type { TimedEvent } from "@incidentrank/simulator";

/** The background compaction/rollup job's nightly run begins, and its
 * IOPS draw starts climbing against the shared storage volume. */
const BATCH_WORKLOAD_RAMPING_MS = 30_000;

/** A second wave: the batch job reaches its steady-state IOPS draw,
 * fully saturating the volume — but only as the continuation of an
 * already-visible trend (storageIopsUtilization, checkpointQueueDepth,
 * and dbQueryLatencyMs have already been climbing since
 * BATCH_WORKLOAD_RAMPING_MS), never a surprise flip from a
 * healthy-looking state. A candidate watching those metrics rise has
 * every reason to expect this. */
const BATCH_WORKLOAD_SATURATING_MS = BATCH_WORKLOAD_RAMPING_MS + 3 * 60_000;

/**
 * Elapsed-time markers used purely to escalate batchBacklogMinutes in
 * authored steps while the background workload is paused or running at
 * reduced concurrency (rules.ts combines these triggers with the
 * candidate's own control choice — the trigger alone never determines
 * backlog growth). This is the pressure-transfer scenario's own
 * candidate-visible evidence: batchThroughputRowsPerSec sits at (or
 * near) zero and batchBacklogMinutes climbs every step for as long as
 * the candidate keeps the batch job suppressed, so "how long is it safe
 * to leave this paused" is always answerable from currently-visible
 * metrics, never a hidden timer.
 */
const BACKLOG_STEP_1_MS = BATCH_WORKLOAD_RAMPING_MS + 2 * 60_000;
const BACKLOG_STEP_2_MS = BATCH_WORKLOAD_RAMPING_MS + 5 * 60_000;
const BACKLOG_STEP_3_MS = BATCH_WORKLOAD_RAMPING_MS + 9 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "batch-workload-ramping",
    atMs: BATCH_WORKLOAD_RAMPING_MS,
    type: "TRIGGER_SET",
    message:
      "The nightly background compaction job has started and storage IOPS utilization is climbing with it.",
    setTriggers: { batchWorkloadRunning: true },
  },
  {
    id: "backlog-elapsed-step-1",
    atMs: BACKLOG_STEP_1_MS,
    type: "TRIGGER_SET",
    message: "The compaction job has been running for several minutes.",
    setTriggers: { batchWorkloadRunning: true, backlogElapsedStep1: true },
  },
  {
    id: "batch-workload-saturating",
    atMs: BATCH_WORKLOAD_SATURATING_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained compaction I/O has driven storage IOPS utilization to its ceiling; checkpoint flushes are now queueing behind it.",
    setTriggers: {
      batchWorkloadRunning: true,
      backlogElapsedStep1: true,
      iopsSaturating: true,
    },
  },
  {
    id: "backlog-elapsed-step-2",
    atMs: BACKLOG_STEP_2_MS,
    type: "TRIGGER_SET",
    message: "The compaction job's scheduled completion window is now at risk if it stays suppressed.",
    setTriggers: {
      batchWorkloadRunning: true,
      backlogElapsedStep1: true,
      backlogElapsedStep2: true,
    },
  },
  {
    id: "backlog-elapsed-step-3",
    atMs: BACKLOG_STEP_3_MS,
    type: "TRIGGER_SET",
    message: "The compaction job has missed its scheduled completion window.",
    setTriggers: {
      batchWorkloadRunning: true,
      backlogElapsedStep1: true,
      backlogElapsedStep2: true,
      backlogElapsedStep3: true,
    },
  },
];

export {
  BATCH_WORKLOAD_RAMPING_MS,
  BATCH_WORKLOAD_SATURATING_MS,
  BACKLOG_STEP_1_MS,
  BACKLOG_STEP_2_MS,
  BACKLOG_STEP_3_MS,
};
