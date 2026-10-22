import type { CandidateUIDescriptor } from "../candidate-ui";
import { READ_ROUTING_MODE_KEY, REPLICATION_BATCH_SIZE_KEY, WRITE_THROTTLE_ENABLED_KEY } from "./controls";

export const readReplicaLagCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "replicationLagMs", label: "Replication Lag", sourceStateKey: "replicationLagMs", format: "duration" },
    { key: "staleReadRate", label: "Stale Read Rate", sourceStateKey: "staleReadRate", format: "percentage" },
    { key: "writeLatencyMs", label: "Write Latency", sourceStateKey: "writeLatencyMs", format: "duration" },
    { key: "queuedWrites", label: "Queued Writes", sourceStateKey: "queuedWrites", format: "number" },
    { key: "replicaStatus", label: "Replica Status", sourceStateKey: "replicaStatus", format: "status" },
  ],
  controls: [
    {
      key: READ_ROUTING_MODE_KEY,
      label: "Read Routing Mode",
      componentId: "read-replica",
      valueLabels: {
        "always-replica": "Always Replica",
        "primary-for-recent-writes": "Primary for Recent Writes",
        "always-primary": "Always Primary",
      },
    },
    {
      key: REPLICATION_BATCH_SIZE_KEY,
      label: "Replication Batch Size",
      componentId: "primary-database",
      valueLabels: { small: "Small", medium: "Medium", large: "Large" },
    },
    {
      key: WRITE_THROTTLE_ENABLED_KEY,
      label: "Write Throttling",
      componentId: "write-service",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "write-service", label: "Write Service" },
    { id: "primary-database", label: "Primary Database" },
    { id: "read-replica", label: "Read Replica" },
    { id: "read-service", label: "Read Service" },
    { id: "reporting-job", label: "Reporting Job" },
  ],
};
