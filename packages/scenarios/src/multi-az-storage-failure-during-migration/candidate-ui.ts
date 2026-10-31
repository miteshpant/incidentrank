import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  MIGRATION_RETRY_BACKOFF_KEY,
  PAUSE_MIGRATION_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 *
 * `controllerCpuPercent` is the noise metric: it climbs sharply once
 * the retry storm begins (the controller is busy retrying), but it is
 * a side effect of the cascade, not something a candidate should chase
 * fixing directly — "lower the controller's CPU" is not a control this
 * scenario even offers, by design, mirroring
 * monitoringAgentFlapCount in the reference incident.
 */
export const multiAzStorageFailureDuringMigrationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "appServiceErrorRatePercent",
      label: "App Service Error Rate",
      sourceStateKey: "appServiceErrorRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "appServiceP99LatencyMs",
      label: "App Service p99 Latency",
      sourceStateKey: "appServiceP99LatencyMs",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "azAVolumeIoErrorRatePercent",
      label: "AZ-A Volume I/O Error Rate",
      sourceStateKey: "azAVolumeIoErrorRatePercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "migrationRetryRatePerMinute",
      label: "Migration Controller Retry Rate",
      sourceStateKey: "migrationRetryRatePerMinute",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "azCConnectionUtilizationPercent",
      label: "AZ-C Connection Utilization",
      sourceStateKey: "azCConnectionUtilizationPercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "azCP99LatencyMs",
      label: "AZ-C p99 Latency",
      sourceStateKey: "azCP99LatencyMs",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "migrationCopyThroughputMBps",
      label: "Migration Copy Throughput",
      sourceStateKey: "migrationCopyThroughputMBps",
      format: "number",
      roleInIncident: "context",
    },
    {
      key: "migrationProgressPercent",
      label: "Migration Progress",
      sourceStateKey: "migrationProgressPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "controllerCpuPercent",
      label: "Migration Controller CPU",
      sourceStateKey: "controllerCpuPercent",
      format: "percentage",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_AZ_A_VOLUME_HEALTH_KEY,
      label: "Inspect AZ-A Volume Health",
      componentId: "storage-az-a",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_MIGRATION_RETRY_LOGS_KEY,
      label: "Inspect Migration Controller Retry Logs",
      componentId: "migration-controller",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_AZ_C_SATURATION_KEY,
      label: "Inspect AZ-C Saturation",
      componentId: "storage-az-c",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: PAUSE_MIGRATION_KEY,
      label: "Pause Migration",
      componentId: "migration-controller",
      kind: "remediation",
      valueLabels: { false: "Running", true: "Paused" },
    },
    {
      key: MIGRATION_RETRY_BACKOFF_KEY,
      label: "Migration Retry Backoff (seconds)",
      componentId: "migration-controller",
      kind: "remediation",
      valueLabels: { "1": "1s", "5": "5s", "30": "30s", "120": "120s" },
    },
    {
      key: RESTART_AZ_A_VOLUMES_KEY,
      label: "Restart AZ-A Volumes",
      componentId: "storage-az-a",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
      label: "Failover Live Traffic to AZ-C",
      componentId: "storage-router",
      kind: "remediation",
      valueLabels: { "0": "0%", "25": "25%", "50": "50%", "100": "100%" },
    },
  ],
  components: [
    { id: "app-service", label: "App Service" },
    { id: "storage-router", label: "Storage Router" },
    { id: "storage-az-a", label: "Storage AZ-A (migration source)" },
    { id: "storage-az-b", label: "Storage AZ-B (migration target)" },
    { id: "storage-az-c", label: "Storage AZ-C (remaining healthy replica)" },
    { id: "migration-controller", label: "Migration Controller" },
  ],
};
