import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
} from "./controls";

export const backfillOverwhelmsProductionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Live Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "liveWriteP99Ms", label: "Live Write p99 Latency (ms)", sourceStateKey: "liveWriteP99Ms", format: "number" },
    { key: "dbLockWaitMs", label: "DB Lock Wait (ms)", sourceStateKey: "dbLockWaitMs", format: "number" },
    { key: "liveWriteTimeoutFailureCount", label: "Live Write Timeout Failures", sourceStateKey: "liveWriteTimeoutFailureCount", format: "number" },
    { key: "primaryDatabaseStatus", label: "Primary Database Status", sourceStateKey: "primaryDatabaseStatus", format: "status" },
    { key: "liveConnectionPoolUtilizationPct", label: "Live Connection Pool Utilization", sourceStateKey: "liveConnectionPoolUtilizationPct", format: "percentage" },
    { key: "backfillQueueDepth", label: "Backfill Queue Depth (rows)", sourceStateKey: "backfillQueueDepth", format: "number" },
    { key: "backfillRowsCompletedCount", label: "Backfill Rows Completed", sourceStateKey: "backfillRowsCompletedCount", format: "number" },
    { key: "backfillStatus", label: "Backfill Status", sourceStateKey: "backfillStatus", format: "status" },
    { key: "skippedRowCount", label: "Skipped Rows (historical)", sourceStateKey: "skippedRowCount", format: "number" },
    { key: "migrationDeadlineDaysRemaining", label: "Migration Deadline (days remaining)", sourceStateKey: "migrationDeadlineDaysRemaining", format: "number" },
    { key: "productionDatabaseStatus", label: "Production Database Status", sourceStateKey: "productionDatabaseStatus", format: "status" },
  ],
  controls: [
    {
      key: BACKFILL_CONCURRENCY_KEY,
      label: "Backfill Concurrency",
      componentId: "backfill-workers",
      valueLabels: { low: "Low", medium: "Medium", high: "High" },
    },
    {
      key: BACKFILL_CHUNK_SIZE_KEY,
      label: "Backfill Chunk Size",
      componentId: "backfill-workers",
      valueLabels: { large: "Large", small: "Small" },
    },
    {
      key: BACKFILL_SCHEDULING_WINDOW_KEY,
      label: "Backfill Scheduling Window",
      componentId: "backfill-coordinator",
      valueLabels: { anytime: "Anytime", "off-peak-only": "Off-Peak Only" },
    },
    {
      key: DB_PRIORITY_MODE_KEY,
      label: "DB Priority Mode",
      componentId: "primary-database",
      valueLabels: { balanced: "Balanced", "live-traffic-first": "Live Traffic First" },
    },
    {
      key: BACKFILL_PAUSE_RESUME_KEY,
      label: "Backfill Pause / Resume",
      componentId: "backfill-coordinator",
      valueLabels: { running: "Running", paused: "Paused" },
    },
    {
      key: DB_STATEMENT_TIMEOUT_MODE_KEY,
      label: "DB Statement Timeout Mode",
      componentId: "primary-database",
      valueLabels: { long: "Long", short: "Short" },
    },
    {
      key: QUEUE_DISPATCH_RATE_KEY,
      label: "Queue Dispatch Rate",
      componentId: "backfill-coordinator",
      valueLabels: { unthrottled: "Unthrottled", throttled: "Throttled" },
    },
    {
      key: SKIP_MARK_COMPLETE_KEY,
      label: "Skip / Mark Complete",
      componentId: "backfill-coordinator",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "production-clients", label: "Production Clients" },
    { id: "application-api", label: "Application API" },
    { id: "primary-database", label: "Primary Database" },
    { id: "backfill-workers", label: "Backfill Workers" },
    { id: "backfill-coordinator", label: "Backfill Queue / Coordinator" },
  ],
};
