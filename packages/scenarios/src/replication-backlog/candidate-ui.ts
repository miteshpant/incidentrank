import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  REPLICA_COUNT_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  TRAFFIC_PRIORITY_KEY,
  WRITE_THROTTLE_LEVEL_KEY,
} from "./controls";

export const replicationBacklogCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "writeThroughputPerSec", label: "Write Throughput", sourceStateKey: "writeThroughputPerSec", format: "number" },
    { key: "writeAcceptanceRate", label: "Write Acceptance Rate", sourceStateKey: "writeAcceptanceRate", format: "percentage" },
    { key: "replicationLagMs", label: "Replication Lag", sourceStateKey: "replicationLagMs", format: "duration" },
    { key: "replicaApplyRatePerSec", label: "Replica Apply Rate", sourceStateKey: "replicaApplyRatePerSec", format: "number" },
    { key: "staleReadAgeMs", label: "Stale-Read Age", sourceStateKey: "staleReadAgeMs", format: "duration" },
    { key: "networkPressure", label: "Network Pressure", sourceStateKey: "networkPressure", format: "percentage" },
    { key: "storagePressure", label: "Storage Pressure", sourceStateKey: "storagePressure", format: "percentage" },
    { key: "primaryStatus", label: "Primary Status", sourceStateKey: "primaryStatus", format: "status" },
  ],
  controls: [
    {
      key: WRITE_THROTTLE_LEVEL_KEY,
      label: "Write Throttle",
      componentId: "primary-database",
      valueLabels: { none: "None", moderate: "Moderate", aggressive: "Aggressive" },
    },
    {
      key: REPLICATION_WORKER_COUNT_KEY,
      label: "Replication Workers",
      componentId: "replication-stream",
    },
    {
      key: BATCHING_MODE_KEY,
      label: "Batching Mode",
      componentId: "replication-stream",
      valueLabels: {
        "uncompressed-small-batch": "Small Batches",
        "compressed-batch": "Compressed Batches",
        "large-uncompressed-batch": "Large Uncompressed Batches",
      },
    },
    {
      key: READ_ROUTING_KEY,
      label: "Read Routing",
      componentId: "read-clients",
      valueLabels: {
        "replica-only": "Replica Only",
        "primary-for-fresh-reads": "Primary For Fresh Reads",
        "primary-only": "Primary Only",
      },
    },
    {
      key: TRAFFIC_PRIORITY_KEY,
      label: "Write Traffic Priority",
      componentId: "write-clients",
      valueLabels: { balanced: "Balanced", "prioritize-critical-writes": "Prioritize Critical Writes" },
    },
    {
      key: REPLICA_COUNT_KEY,
      label: "Replica Count",
      componentId: "replica-fleet",
    },
  ],
  components: [
    { id: "write-clients", label: "Write Clients" },
    { id: "primary-database", label: "Primary Database" },
    { id: "replication-stream", label: "Replication Stream" },
    { id: "replica-fleet", label: "Replica Fleet" },
    { id: "read-clients", label: "Read Clients" },
  ],
};
