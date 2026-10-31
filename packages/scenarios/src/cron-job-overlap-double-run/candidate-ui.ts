import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CRON_INTERVAL_MINUTES_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const cronJobOverlapDoubleRunCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "jobRunDurationMinutes",
      label: "Job Run Duration",
      sourceStateKey: "jobRunDurationMinutes",
      format: "duration",
      roleInIncident: "contributing_factor",
    },
    {
      key: "concurrentRunCount",
      label: "Concurrent Run Count",
      sourceStateKey: "concurrentRunCount",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "dailyMetricsDuplicateRowPercent",
      label: "Daily Metrics Duplicate Row %",
      sourceStateKey: "dailyMetricsDuplicateRowPercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "dailyMetricsRowCount",
      label: "Daily Metrics Row Count",
      sourceStateKey: "dailyMetricsRowCount",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "sourceTableScanLatencyMs",
      label: "Source Table Scan Latency",
      sourceStateKey: "sourceTableScanLatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "schedulerMissedFireCount",
      label: "Scheduler Missed Fire Count",
      sourceStateKey: "schedulerMissedFireCount",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_JOB_RUN_HISTORY_KEY,
      label: "Inspect Job Run History",
      componentId: "reconciliation-job",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_SOURCE_TABLE_GROWTH_KEY,
      label: "Inspect Source Table Growth",
      componentId: "source-orders-table",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
      label: "Inspect Daily Metrics Row Counts",
      componentId: "daily-metrics-table",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: JOB_CONCURRENCY_GUARD_ENABLED_KEY,
      label: "Enable Job Concurrency Guard",
      componentId: "reconciliation-job",
      kind: "remediation",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: JOB_WORKER_COUNT_KEY,
      label: "Job Worker Count",
      componentId: "reconciliation-job",
      kind: "remediation",
      valueLabels: { "4": "4", "8": "8", "16": "16", "32": "32" },
    },
    {
      key: CRON_INTERVAL_MINUTES_KEY,
      label: "Cron Schedule Interval (minutes)",
      componentId: "cron-scheduler",
      kind: "remediation",
      valueLabels: { "30": "30 min", "60": "60 min", "120": "120 min" },
    },
  ],
  components: [
    { id: "cron-scheduler", label: "Cron Scheduler" },
    { id: "reconciliation-job", label: "Nightly Reconciliation Job" },
    { id: "source-orders-table", label: "Source Orders Table" },
    { id: "daily-metrics-table", label: "Daily Metrics Table" },
  ],
};
