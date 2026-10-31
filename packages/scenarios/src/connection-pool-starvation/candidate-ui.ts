import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DB_POOL_MAX_SIZE_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_POOL_CONFIG_KEY,
  INSPECT_TRAFFIC_GRAPHS_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 *
 * trafficRequestsPerSecond is tagged `context` rather than a symptom —
 * it stays flat throughout the incident, which is exactly the signal
 * that distinguishes this config-regression incident from a
 * demand-driven saturation incident (contrast database-connection-
 * saturation, where traffic climbing IS the symptom).
 */
export const connectionPoolStarvationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "trafficRequestsPerSecond",
      label: "Traffic (req/s)",
      sourceStateKey: "trafficRequestsPerSecond",
      format: "number",
      roleInIncident: "context",
    },
    {
      key: "requestLatencyMs",
      label: "Request Latency",
      sourceStateKey: "requestLatencyMs",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "requestErrorRate",
      label: "Request Error Rate",
      sourceStateKey: "requestErrorRate",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "poolUtilizationPercent",
      label: "Connection Pool Utilization",
      sourceStateKey: "poolUtilizationPercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "poolWaitQueueDepth",
      label: "Pool Wait Queue Depth",
      sourceStateKey: "poolWaitQueueDepth",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "dbCpuPercent",
      label: "Primary DB CPU",
      sourceStateKey: "dbCpuPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "apiPodRestartCount",
      label: "API Pod Restart Count",
      sourceStateKey: "apiPodRestartCount",
      format: "number",
      roleInIncident: "context",
    },
    {
      key: "deployAuditLogScrollCount",
      label: "Deploy Audit Log Scroll Count",
      sourceStateKey: "deployAuditLogScrollCount",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_DEPLOY_HISTORY_KEY,
      label: "Inspect Deploy History",
      componentId: "deploy-pipeline",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_TRAFFIC_GRAPHS_KEY,
      label: "Inspect Traffic Graphs",
      componentId: "api-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_POOL_CONFIG_KEY,
      label: "Inspect Connection Pool Config",
      componentId: "connection-pool",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: RESTART_API_PODS_KEY,
      label: "Restart API Pods",
      componentId: "api-service",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: SCALE_API_REPLICAS_KEY,
      label: "Scale Out API Replicas",
      componentId: "api-service",
      kind: "remediation",
      valueLabels: { false: "Not scaled", true: "Scaled out" },
    },
    {
      key: DB_POOL_MAX_SIZE_KEY,
      label: "DB Connection Pool Max Size",
      componentId: "connection-pool",
      kind: "remediation",
      valueLabels: { "10": "10", "25": "25", "50": "50", "100": "100", "200": "200" },
    },
  ],
  components: [
    { id: "deploy-pipeline", label: "Deploy Pipeline" },
    { id: "api-service", label: "API Service" },
    { id: "connection-pool", label: "DB Connection Pool" },
    { id: "primary-db", label: "Primary Database" },
  ],
};
