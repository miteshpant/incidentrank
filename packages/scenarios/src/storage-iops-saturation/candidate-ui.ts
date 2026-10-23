import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKGROUND_WORKLOAD_PAUSED_KEY,
  BATCH_CONCURRENCY_KEY,
  CHECKPOINT_FREQUENCY_SECONDS_KEY,
  QUERY_CONCURRENCY_LIMIT_KEY,
  READ_CACHE_ENABLED_KEY,
  STORAGE_TIER_KEY,
} from "./controls";

export const storageIopsSaturationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "storageIopsUtilization", label: "Storage IOPS Utilization", sourceStateKey: "storageIopsUtilization", format: "percentage" },
    { key: "storageReadLatencyMs", label: "Storage Read Latency", sourceStateKey: "storageReadLatencyMs", format: "duration" },
    { key: "storageWriteLatencyMs", label: "Storage Write Latency", sourceStateKey: "storageWriteLatencyMs", format: "duration" },
    { key: "dbQueryLatencyMs", label: "DB Query Latency", sourceStateKey: "dbQueryLatencyMs", format: "duration" },
    { key: "checkpointQueueDepth", label: "Checkpoint Queue Depth", sourceStateKey: "checkpointQueueDepth", format: "number" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "batchThroughputRowsPerSec", label: "Batch Throughput", sourceStateKey: "batchThroughputRowsPerSec", format: "number" },
    { key: "batchBacklogMinutes", label: "Batch Backlog", sourceStateKey: "batchBacklogMinutes", format: "duration" },
    { key: "storageStatus", label: "Storage Status", sourceStateKey: "storageStatus", format: "status" },
  ],
  controls: [
    {
      key: BACKGROUND_WORKLOAD_PAUSED_KEY,
      label: "Background Compaction Job",
      componentId: "persistent-storage",
      valueLabels: { false: "Running", true: "Paused" },
    },
    {
      key: BATCH_CONCURRENCY_KEY,
      label: "Batch Concurrency",
      componentId: "persistent-storage",
    },
    {
      key: CHECKPOINT_FREQUENCY_SECONDS_KEY,
      label: "Checkpoint Interval (sec)",
      componentId: "database",
    },
    {
      key: STORAGE_TIER_KEY,
      label: "Storage Tier",
      componentId: "persistent-storage",
      valueLabels: { standard: "Standard", "provisioned-iops": "Provisioned IOPS" },
    },
    {
      key: QUERY_CONCURRENCY_LIMIT_KEY,
      label: "Query Concurrency Limit",
      componentId: "api-service",
    },
    {
      key: READ_CACHE_ENABLED_KEY,
      label: "Read Cache",
      componentId: "database",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "api-service", label: "API Service" },
    { id: "database", label: "Database" },
    { id: "persistent-storage", label: "Persistent Storage" },
  ],
};
