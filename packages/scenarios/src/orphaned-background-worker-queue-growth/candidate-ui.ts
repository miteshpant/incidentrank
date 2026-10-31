import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  RESTART_WORKER_PODS_KEY,
  WORKER_CONCURRENCY_KEY,
  PAUSE_PRODUCERS_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const orphanedBackgroundWorkerQueueGrowthCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "producerPublishRatePerSecond",
      label: "Producer Publish Rate",
      sourceStateKey: "producerPublishRatePerSecond",
      format: "number",
      roleInIncident: "context",
    },
    {
      key: "producerErrorRate",
      label: "Producer Error Rate",
      sourceStateKey: "producerErrorRate",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "activeConsumerCount",
      label: "Active Consumer Count",
      sourceStateKey: "activeConsumerCount",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "workerCrashLoopRestartCount",
      label: "Worker Crash-Loop Restart Count",
      sourceStateKey: "workerCrashLoopRestartCount",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "queueDepth",
      label: "Job Queue Depth",
      sourceStateKey: "queueDepth",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "jobAgeP95Seconds",
      label: "Job Age p95",
      sourceStateKey: "jobAgeP95Seconds",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "notificationDeliveryDelaySeconds",
      label: "Notification Delivery Delay",
      sourceStateKey: "notificationDeliveryDelaySeconds",
      format: "duration",
      roleInIncident: "downstream_symptom",
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
      key: INSPECT_WORKER_LOGS_KEY,
      label: "Inspect Worker Pod Logs",
      componentId: "worker-pool",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_DEPLOY_DIFF_KEY,
      label: "Inspect Worker Deploy Diff",
      componentId: "worker-pool",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_QUEUE_DEPTH_KEY,
      label: "Inspect Job Queue Depth Trend",
      componentId: "job-queue",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: ROLLBACK_WORKER_DEPLOY_KEY,
      label: "Rollback Worker Deploy",
      componentId: "worker-pool",
      kind: "remediation",
      valueLabels: { false: "Not rolled back", true: "Rolled back" },
    },
    {
      key: RESTART_WORKER_PODS_KEY,
      label: "Restart Worker Pods",
      componentId: "worker-pool",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency Per Pod",
      componentId: "worker-pool",
      kind: "remediation",
      valueLabels: { "4": "4", "8": "8", "16": "16", "32": "32" },
    },
    {
      key: PAUSE_PRODUCERS_KEY,
      label: "Pause Producers",
      componentId: "producer-service",
      kind: "remediation",
      valueLabels: { false: "Not paused", true: "Paused" },
    },
  ],
  components: [
    { id: "producer-service", label: "Producer Service" },
    { id: "job-queue", label: "Job Queue" },
    { id: "worker-pool", label: "Worker Pool" },
    { id: "notification-api", label: "Notification API" },
  ],
};
