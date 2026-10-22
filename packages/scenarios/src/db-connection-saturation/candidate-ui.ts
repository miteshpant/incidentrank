import type { CandidateUIDescriptor } from "../candidate-ui";
import { POOL_SIZE_KEY, QUERY_TIMEOUT_MS_KEY, READ_REPLICA_ENABLED_KEY } from "./controls";

export const dbConnectionSaturationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "connectionUsage", label: "Connection Usage", sourceStateKey: "connectionUsage", format: "percentage" },
    { key: "requestLatencyMs", label: "Request Latency", sourceStateKey: "requestLatencyMs", format: "duration" },
    { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    { key: "queuedConnections", label: "Queued Connections", sourceStateKey: "queuedConnections", format: "number" },
    { key: "dbStatus", label: "DB Status", sourceStateKey: "dbStatus", format: "status" },
  ],
  controls: [
    { key: POOL_SIZE_KEY, label: "Connection Pool Size", componentId: "connection-pool" },
    {
      key: QUERY_TIMEOUT_MS_KEY,
      label: "Query Timeout",
      componentId: "connection-pool",
      valueLabels: { "500": "500ms", "1000": "1s", "5000": "5s", "15000": "15s" },
    },
    {
      key: READ_REPLICA_ENABLED_KEY,
      label: "Read Replica Enabled",
      componentId: "read-replica",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "api-service", label: "API Service" },
    { id: "background-jobs", label: "Background Jobs" },
    { id: "connection-pool", label: "Connection Pool" },
    { id: "primary-db", label: "Primary Database" },
    { id: "read-replica", label: "Read Replica" },
  ],
};
