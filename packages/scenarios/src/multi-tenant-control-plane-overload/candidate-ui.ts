import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const multiTenantControlPlaneOverloadCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "hotTenantControlPlaneShare", label: "Hot Tenant Control-Plane Share", sourceStateKey: "hotTenantControlPlaneShare", format: "percentage" },
    { key: "schedulerQueueDepth", label: "Scheduler Queue Depth", sourceStateKey: "schedulerQueueDepth", format: "number" },
    { key: "schedulerLatencyMs", label: "Scheduler Latency (ms)", sourceStateKey: "schedulerLatencyMs", format: "duration" },
    { key: "metadataDbWritePressure", label: "Metadata DB Write Pressure", sourceStateKey: "metadataDbWritePressure", format: "percentage" },
    { key: "configConvergenceAgeSeconds", label: "Config Convergence Age (s)", sourceStateKey: "configConvergenceAgeSeconds", format: "duration" },
    { key: "smallTenantConfigSuccessRate", label: "Small-Tenant Config Success Rate", sourceStateKey: "smallTenantConfigSuccessRate", format: "percentage" },
    { key: "workerUtilization", label: "Worker Fleet Utilization", sourceStateKey: "workerUtilization", format: "percentage" },
    { key: "dataPlaneSuccessRate", label: "Data-Plane Success Rate", sourceStateKey: "dataPlaneSuccessRate", format: "percentage" },
    { key: "metadataWriteLossCount", label: "Metadata Write Loss Count", sourceStateKey: "metadataWriteLossCount", format: "number" },
    { key: "controlPlaneStatus", label: "Control-Plane Status", sourceStateKey: "controlPlaneStatus", format: "status" },
  ],
  controls: [
    {
      key: HOT_TENANT_QUOTA_KEY,
      label: "Hot Tenant Quota",
      componentId: "scheduler",
      valueLabels: {
        unthrottled: "Unthrottled",
        "capped-30-percent": "Capped at 30%",
        "capped-10-percent": "Capped at 10%",
      },
    },
    {
      key: QUEUE_PARTITIONING_KEY,
      label: "Queue Partitioning",
      componentId: "scheduler",
      valueLabels: { "shared-queue": "Shared Queue", "dedicated-lane": "Dedicated Lane" },
    },
    {
      key: METADATA_WRITE_BATCHING_KEY,
      label: "Metadata Write Batching",
      componentId: "metadata-db",
      valueLabels: { small: "Small", moderate: "Moderate", large: "Large" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency",
      componentId: "worker-fleet",
      valueLabels: { baseline: "Baseline", "scaled-up": "Scaled Up" },
    },
    {
      key: BACKLOG_DRAIN_KEY,
      label: "Backlog Drain Mode",
      componentId: "config-service",
      valueLabels: { draining: "Draining", paused: "Paused" },
    },
  ],
  components: [
    { id: "tenant-apis", label: "Tenant APIs" },
    { id: "scheduler", label: "Scheduler" },
    { id: "config-service", label: "Config Service" },
    { id: "policy-engine", label: "Policy Engine" },
    { id: "metadata-db", label: "Metadata DB" },
    { id: "worker-fleet", label: "Worker Fleet" },
  ],
};
