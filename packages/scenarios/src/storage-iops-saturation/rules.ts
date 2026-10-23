import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKGROUND_WORKLOAD_PAUSED_KEY,
  BATCH_CONCURRENCY_KEY,
  CHECKPOINT_FREQUENCY_SECONDS_KEY,
  QUERY_CONCURRENCY_LIMIT_KEY,
  READ_CACHE_ENABLED_KEY,
  STORAGE_TIER_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  database: "healthy",
  "persistent-storage": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  database: "degraded",
  "persistent-storage": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-service": "critical",
  database: "critical",
  "persistent-storage": "critical",
};

const storageCriticalApiHealthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  database: "degraded",
  "persistent-storage": "critical",
};

/**
 * Authored rule table for Storage IOPS Saturation, ordered most-specific
 * first. A nightly background compaction job saturates storage IOPS;
 * read/write latency, DB query latency, checkpoint queueing, and
 * eventually API latency all climb together. Two durable paths exist
 * (storage tier upgrade; checkpoint-frequency extension), and one
 * immediate-relief lever genuinely transfers pressure onto a second,
 * candidate-visible subsystem: pausing/throttling the batch job clears
 * every customer-facing metric but accumulates batch backlog
 * (batchBacklogMinutes) for as long as it stays suppressed — a real
 * prioritization tradeoff, not a free fix. Scaling query concurrency
 * limit down is a genuine partial relief for read pressure that costs
 * API-level queueing; the read cache helps reads only and does nothing
 * for checkpoint/batch write IOPS.
 */
export const storageIopsSaturationRules: Rule[] = [
  // ── Strong, durable recovery: storage tier upgraded to provisioned
  // IOPS. The volume's IOPS ceiling is now well above what the batch
  // job plus normal query traffic draw, so every metric recovers AND
  // the batch job keeps running at full throughput — no backlog
  // accumulates. This is intentionally the first trigger-gated rule so
  // it wins over every other control combination once the tier is
  // upgraded, matching Missing Database Index's precedent for "the real
  // fix wins regardless of other levers."
  {
    id: "tier-upgraded-recovery",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlEquals: { [STORAGE_TIER_KEY]: "provisioned-iops" },
    },
    incidentState: "tier-upgraded",
    values: {
      storageIopsUtilization: 35,
      storageReadLatencyMs: 4,
      storageWriteLatencyMs: 5,
      dbQueryLatencyMs: 19,
      checkpointQueueDepth: 2,
      apiLatencyMs: 48,
      batchThroughputRowsPerSec: 12_000,
      batchBacklogMinutes: 0,
      storageStatus: "normal",
      storageRecoveryMode: "tier-upgraded",
      checkpointSafety: "standard",
    },
    componentHealth: healthyHealth,
  },

  // ── Pressure-transfer relief: background workload fully paused.
  // Every customer-facing metric recovers immediately and fully — but
  // batch throughput drops to zero and batchBacklogMinutes escalates
  // in authored steps for as long as the pause continues, visibly
  // trading batch completion time for customer health. Matched before
  // the generic baseline/harmful rules below regardless of the elapsed
  // backlog step, since the customer-facing recovery is the same at
  // every step — only batchBacklogMinutes/batchThroughputRowsPerSec
  // differ, handled by the three ordered sub-rules immediately below.
  {
    id: "paused-relief-backlog-step-3",
    when: {
      triggerEquals: {
        batchWorkloadRunning: true,
        backlogElapsedStep3: true,
      },
      controlEquals: { [BACKGROUND_WORKLOAD_PAUSED_KEY]: true },
    },
    incidentState: "paused-backlog-critical",
    values: {
      storageIopsUtilization: 24,
      storageReadLatencyMs: 4,
      storageWriteLatencyMs: 5,
      dbQueryLatencyMs: 18,
      checkpointQueueDepth: 2,
      apiLatencyMs: 46,
      batchThroughputRowsPerSec: 0,
      batchBacklogMinutes: 540,
      storageStatus: "normal",
      storageRecoveryMode: "workload-paused",
      checkpointSafety: "standard",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "paused-relief-backlog-step-2",
    when: {
      triggerEquals: {
        batchWorkloadRunning: true,
        backlogElapsedStep2: true,
      },
      controlEquals: { [BACKGROUND_WORKLOAD_PAUSED_KEY]: true },
    },
    incidentState: "paused-backlog-rising",
    values: {
      storageIopsUtilization: 24,
      storageReadLatencyMs: 4,
      storageWriteLatencyMs: 5,
      dbQueryLatencyMs: 18,
      checkpointQueueDepth: 2,
      apiLatencyMs: 46,
      batchThroughputRowsPerSec: 0,
      batchBacklogMinutes: 180,
      storageStatus: "normal",
      storageRecoveryMode: "workload-paused",
      checkpointSafety: "standard",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "paused-relief-backlog-step-1",
    when: {
      triggerEquals: {
        batchWorkloadRunning: true,
        backlogElapsedStep1: true,
      },
      controlEquals: { [BACKGROUND_WORKLOAD_PAUSED_KEY]: true },
    },
    incidentState: "paused-backlog-starting",
    values: {
      storageIopsUtilization: 24,
      storageReadLatencyMs: 4,
      storageWriteLatencyMs: 5,
      dbQueryLatencyMs: 18,
      checkpointQueueDepth: 2,
      apiLatencyMs: 46,
      batchThroughputRowsPerSec: 0,
      batchBacklogMinutes: 30,
      storageStatus: "normal",
      storageRecoveryMode: "workload-paused",
      checkpointSafety: "standard",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "paused-relief-backlog-none-yet",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlEquals: { [BACKGROUND_WORKLOAD_PAUSED_KEY]: true },
    },
    incidentState: "paused-backlog-starting",
    values: {
      storageIopsUtilization: 24,
      storageReadLatencyMs: 4,
      storageWriteLatencyMs: 5,
      dbQueryLatencyMs: 18,
      checkpointQueueDepth: 2,
      apiLatencyMs: 46,
      batchThroughputRowsPerSec: 0,
      batchBacklogMinutes: 5,
      storageStatus: "normal",
      storageRecoveryMode: "workload-paused",
      checkpointSafety: "standard",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable, bounded tradeoff: batch concurrency reduced to its
  // lowest non-zero level (1) instead of a full pause. Customer-facing
  // metrics recover to a safe (if not pristine) level, batch throughput
  // is reduced but not zero, and backlog grows far more slowly than a
  // full pause — a genuinely bounded tradeoff rather than an all-or-
  // nothing suppression of the batch job's own progress.
  {
    id: "reduced-concurrency-bounded-tradeoff",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlAtMost: { [BATCH_CONCURRENCY_KEY]: 1 },
      controlEquals: { [BACKGROUND_WORKLOAD_PAUSED_KEY]: false },
    },
    incidentState: "reduced-concurrency",
    values: {
      storageIopsUtilization: 58,
      storageReadLatencyMs: 9,
      storageWriteLatencyMs: 11,
      dbQueryLatencyMs: 45,
      checkpointQueueDepth: 6,
      apiLatencyMs: 90,
      batchThroughputRowsPerSec: 1_500,
      batchBacklogMinutes: 60,
      storageStatus: "warning",
      storageRecoveryMode: "workload-throttled",
      checkpointSafety: "standard",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial, still degraded: checkpoint interval extended well
  // beyond the safe default while the batch job keeps running at full
  // concurrency and storage is still saturated. Steady-state write IOPS
  // drops somewhat (fewer flush cycles), giving modest relief, but the
  // batch job's own read/write IOPS draw is untouched — storage is
  // still under real pressure, and the crash-recovery replay window is
  // now meaningfully longer (checkpointSafety: "extended").
  {
    id: "extended-checkpoint-partial-relief",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlAtLeast: { [CHECKPOINT_FREQUENCY_SECONDS_KEY]: 180 },
      controlEquals: {
        [BACKGROUND_WORKLOAD_PAUSED_KEY]: false,
        [STORAGE_TIER_KEY]: "standard",
      },
    },
    incidentState: "checkpoint-extended",
    values: {
      storageIopsUtilization: 74,
      storageReadLatencyMs: 14,
      storageWriteLatencyMs: 16,
      dbQueryLatencyMs: 110,
      checkpointQueueDepth: 9,
      apiLatencyMs: 220,
      batchThroughputRowsPerSec: 11_500,
      batchBacklogMinutes: 0,
      storageStatus: "warning",
      storageRecoveryMode: "unresolved",
      checkpointSafety: "extended",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful: query concurrency limit lowered while storage is
  // already saturated and nothing upstream of the storage layer was
  // addressed. Fewer concurrent queries reach the database, so some
  // read pressure is removed from storage — dbQueryLatencyMs and
  // storageReadLatencyMs improve slightly — but throttled requests now
  // queue hard at the API edge instead, so apiLatencyMs and the
  // request-facing experience get WORSE than the unmitigated baseline.
  // The cost moved, it did not disappear.
  {
    id: "query-throttle-worsens-api",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlAtMost: { [QUERY_CONCURRENCY_LIMIT_KEY]: 50 },
      controlEquals: {
        [BACKGROUND_WORKLOAD_PAUSED_KEY]: false,
        [STORAGE_TIER_KEY]: "standard",
      },
    },
    incidentState: "query-throttled-api-degraded",
    values: {
      storageIopsUtilization: 86,
      storageReadLatencyMs: 20,
      storageWriteLatencyMs: 24,
      dbQueryLatencyMs: 180,
      checkpointQueueDepth: 13,
      apiLatencyMs: 1_900,
      batchThroughputRowsPerSec: 12_000,
      batchBacklogMinutes: 0,
      storageStatus: "critical",
      storageRecoveryMode: "unresolved",
      checkpointSafety: "standard",
    },
    componentHealth: storageCriticalApiHealthyHealth,
  },

  // ── Partial relief: read cache enabled while the batch job keeps
  // running unmitigated. Repeat reads are absorbed, so
  // storageReadLatencyMs and dbQueryLatencyMs improve somewhat, but the
  // cache does nothing for the write IOPS generated by checkpoint
  // flushes or the compaction job itself — storage remains genuinely
  // saturated.
  {
    id: "read-cache-partial-relief",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlEquals: {
        [READ_CACHE_ENABLED_KEY]: true,
        [BACKGROUND_WORKLOAD_PAUSED_KEY]: false,
        [STORAGE_TIER_KEY]: "standard",
      },
      controlAtLeast: { [CHECKPOINT_FREQUENCY_SECONDS_KEY]: 30 },
    },
    incidentState: "read-cache-warming",
    values: {
      storageIopsUtilization: 80,
      storageReadLatencyMs: 10,
      storageWriteLatencyMs: 19,
      dbQueryLatencyMs: 95,
      checkpointQueueDepth: 11,
      apiLatencyMs: 310,
      batchThroughputRowsPerSec: 12_000,
      batchBacklogMinutes: 0,
      storageStatus: "warning",
      storageRecoveryMode: "unresolved",
      checkpointSafety: "standard",
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline: sustained compaction I/O finally
  // saturates the volume outright, deepening the already-visible
  // checkpoint queueing and latency trend. Only reachable once no
  // mitigation above has matched.
  {
    id: "iops-saturating-baseline",
    when: {
      triggerEquals: { batchWorkloadRunning: true, iopsSaturating: true },
      controlEquals: {
        [BACKGROUND_WORKLOAD_PAUSED_KEY]: false,
        [STORAGE_TIER_KEY]: "standard",
      },
    },
    incidentState: "iops-saturated",
    values: {
      storageIopsUtilization: 97,
      storageReadLatencyMs: 26,
      storageWriteLatencyMs: 32,
      dbQueryLatencyMs: 240,
      checkpointQueueDepth: 18,
      apiLatencyMs: 2_600,
      batchThroughputRowsPerSec: 12_000,
      batchBacklogMinutes: 0,
      storageStatus: "critical",
      storageRecoveryMode: "unresolved",
      checkpointSafety: "standard",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: the compaction job is ramping and the
  // candidate has taken no meaningfully mitigating action yet.
  {
    id: "batch-workload-ramping-baseline",
    when: {
      triggerEquals: { batchWorkloadRunning: true },
      controlEquals: {
        [BACKGROUND_WORKLOAD_PAUSED_KEY]: false,
        [STORAGE_TIER_KEY]: "standard",
      },
    },
    incidentState: "iops-rising",
    values: {
      storageIopsUtilization: 88,
      storageReadLatencyMs: 21,
      storageWriteLatencyMs: 26,
      dbQueryLatencyMs: 190,
      checkpointQueueDepth: 15,
      apiLatencyMs: 1_450,
      batchThroughputRowsPerSec: 12_000,
      batchBacklogMinutes: 0,
      storageStatus: "critical",
      storageRecoveryMode: "unresolved",
      checkpointSafety: "standard",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      storageIopsUtilization: 22,
      storageReadLatencyMs: 4,
      storageWriteLatencyMs: 5,
      dbQueryLatencyMs: 18,
      checkpointQueueDepth: 2,
      apiLatencyMs: 45,
      batchThroughputRowsPerSec: 12_000,
      batchBacklogMinutes: 0,
      storageStatus: "normal",
      storageRecoveryMode: "unresolved",
      checkpointSafety: "standard",
    },
    componentHealth: healthyHealth,
  },
];
