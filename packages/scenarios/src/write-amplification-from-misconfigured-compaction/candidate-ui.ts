import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  COMPACTION_LEVEL_MULTIPLIER_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  SCALE_UP_DISK_IOPS_KEY,
  THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 *
 * configChangeAgeDays is the one signal that points backward in time to
 * the actual root cause (the compaction multiplier change made three
 * weeks earlier) rather than at the current symptom — tagged
 * root_cause alongside writeAmplificationFactor itself, since both
 * together are what let a candidate reason backward from "disk IOPS is
 * saturated right now" to "something was misconfigured weeks ago."
 */
export const writeAmplificationFromMisconfiguredCompactionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "writeLatencyP99Ms",
      label: "Write Latency (p99)",
      sourceStateKey: "writeLatencyP99Ms",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "writeErrorRate",
      label: "Write Error Rate",
      sourceStateKey: "writeErrorRate",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "writeAmplificationFactor",
      label: "Write Amplification Factor",
      sourceStateKey: "writeAmplificationFactor",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "compactionBacklogSstables",
      label: "Compaction Backlog (SSTables)",
      sourceStateKey: "compactionBacklogSstables",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "diskIopsUtilizationPercent",
      label: "Disk IOPS Utilization",
      sourceStateKey: "diskIopsUtilizationPercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "diskQueueDepth",
      label: "Disk Queue Depth",
      sourceStateKey: "diskQueueDepth",
      format: "number",
      roleInIncident: "context",
    },
    {
      key: "cpuUtilizationPercent",
      label: "Storage Engine CPU Utilization",
      sourceStateKey: "cpuUtilizationPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "configChangeAgeDays",
      label: "Compaction Config Last Changed (days ago)",
      sourceStateKey: "configChangeAgeDays",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "monitoringDashboardRefreshLagSeconds",
      label: "Monitoring Dashboard Refresh Lag",
      sourceStateKey: "monitoringDashboardRefreshLagSeconds",
      format: "duration",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_DISK_IOPS_METRICS_KEY,
      label: "Inspect Disk IOPS Metrics",
      componentId: "disk-iops",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
      label: "Inspect Write Amplification Metrics",
      componentId: "storage-engine",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
      label: "Inspect Compaction Config Change History",
      componentId: "config-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: COMPACTION_LEVEL_MULTIPLIER_KEY,
      label: "Compaction Level Size Multiplier",
      componentId: "storage-engine",
      kind: "remediation",
      valueLabels: { "2": "2 (misconfigured)", "4": "4", "8": "8 (recommended)", "10": "10" },
    },
    {
      key: SCALE_UP_DISK_IOPS_KEY,
      label: "Scale Up Disk IOPS Capacity",
      componentId: "disk-iops",
      kind: "remediation",
      valueLabels: { false: "Not scaled", true: "Scaled up" },
    },
    {
      key: THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
      label: "Throttle Compaction Background IO",
      componentId: "storage-engine",
      kind: "remediation",
      valueLabels: { false: "Not throttled", true: "Throttled" },
    },
  ],
  components: [
    { id: "write-api", label: "Write API" },
    { id: "storage-engine", label: "Storage Engine (LSM Compaction)" },
    { id: "disk-iops", label: "Block Storage (Disk IOPS)" },
    { id: "config-service", label: "Storage Config Service" },
  ],
};
