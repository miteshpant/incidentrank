import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  FORCE_SESSION_RESYNC_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  INSPECT_SESSION_ROUTING_KEY,
  RESEED_HASH_RING_KEY,
  RESTART_APP_SERVERS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const sessionAffinityLossAfterCacheFailoverCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "requestLatencyMs",
      label: "Request Latency",
      sourceStateKey: "requestLatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "requestErrorRatePercent",
      label: "Request Error Rate",
      sourceStateKey: "requestErrorRatePercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "sessionAffinityMismatchRatePercent",
      label: "Session Affinity Mismatch Rate",
      sourceStateKey: "sessionAffinityMismatchRatePercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "sessionStateInconsistencyRatePercent",
      label: "Session State Inconsistency Rate",
      sourceStateKey: "sessionStateInconsistencyRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "unexpectedLogoutRatePercent",
      label: "Unexpected Logout Rate",
      sourceStateKey: "unexpectedLogoutRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "authServiceErrorRatePercent",
      label: "Auth Service Error Rate",
      sourceStateKey: "authServiceErrorRatePercent",
      format: "percentage",
      roleInIncident: "contributing_factor",
    },
    {
      key: "cacheNodeCpuPercent",
      label: "Cache Node CPU",
      sourceStateKey: "cacheNodeCpuPercent",
      format: "percentage",
      roleInIncident: "noise",
    },
    {
      key: "cacheNodeMemoryPercent",
      label: "Cache Node Memory",
      sourceStateKey: "cacheNodeMemoryPercent",
      format: "percentage",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_SESSION_ROUTING_KEY,
      label: "Inspect Session Routing / Hash Ring",
      componentId: "load-balancer",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_AUTH_ERROR_LOGS_KEY,
      label: "Inspect Auth Service Error Logs",
      componentId: "auth-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_CACHE_NODE_METRICS_KEY,
      label: "Inspect Session Cache Node Metrics",
      componentId: "session-cache",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: SCALE_CACHE_CLUSTER_KEY,
      label: "Session Cache Cluster Node Count",
      componentId: "session-cache",
      kind: "remediation",
      valueLabels: { "3": "3", "6": "6", "9": "9", "12": "12" },
    },
    {
      key: RESTART_APP_SERVERS_KEY,
      label: "Restart App Server Pool",
      componentId: "app-server-pool",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: RESEED_HASH_RING_KEY,
      label: "Reseed Consistent-Hash Ring",
      componentId: "load-balancer",
      kind: "remediation",
      valueLabels: { false: "Not reseeded", true: "Reseeded" },
    },
    {
      key: FORCE_SESSION_RESYNC_KEY,
      label: "Force Session Resync Across Nodes",
      componentId: "session-cache",
      kind: "remediation",
      valueLabels: { false: "Not resynced", true: "Resynced" },
    },
  ],
  components: [
    { id: "load-balancer", label: "Load Balancer" },
    { id: "app-server-pool", label: "App Server Pool" },
    { id: "session-cache", label: "Session Cache Cluster" },
    { id: "auth-service", label: "Auth Service" },
  ],
};
