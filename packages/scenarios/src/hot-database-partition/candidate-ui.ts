import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_INSTANCE_COUNT_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  PARTITIONING_STRATEGY_KEY,
  ROUTING_POLICY_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  TENANT_THROTTLE_KEY,
} from "./controls";

export const hotDatabasePartitionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "partitionARequestRate", label: "Partition A Request Rate", sourceStateKey: "partitionARequestRate", format: "number" },
    { key: "partitionBRequestRate", label: "Partition B Request Rate", sourceStateKey: "partitionBRequestRate", format: "number" },
    { key: "partitionCRequestRate", label: "Partition C Request Rate", sourceStateKey: "partitionCRequestRate", format: "number" },
    { key: "partitionDRequestRate", label: "Partition D Request Rate", sourceStateKey: "partitionDRequestRate", format: "number" },
    { key: "partitionALatencyMs", label: "Partition A Latency", sourceStateKey: "partitionALatencyMs", format: "duration" },
    { key: "partitionAQueueDepth", label: "Partition A Queue Depth", sourceStateKey: "partitionAQueueDepth", format: "number" },
    { key: "partitionBLatencyMs", label: "Partition B Latency", sourceStateKey: "partitionBLatencyMs", format: "duration" },
    { key: "partitionBQueueDepth", label: "Partition B Queue Depth", sourceStateKey: "partitionBQueueDepth", format: "number" },
    { key: "hotTenantTrafficSharePct", label: "Top Tenants' Traffic Share", sourceStateKey: "hotTenantTrafficSharePct", format: "percentage" },
    { key: "globalApiLatencyMs", label: "Global API Latency", sourceStateKey: "globalApiLatencyMs", format: "duration" },
    { key: "throttledRequestRatePerSec", label: "Throttled Request Rate", sourceStateKey: "throttledRequestRatePerSec", format: "number" },
    { key: "partitionAStatus", label: "Partition A Status", sourceStateKey: "partitionAStatus", format: "status" },
  ],
  controls: [
    {
      key: PARTITIONING_STRATEGY_KEY,
      label: "Partitioning Strategy",
      componentId: "routing-layer",
      valueLabels: {
        tenantHash: "Tenant Hash",
        saltedHash: "Salted Hash",
        roundRobin: "Round Robin",
      },
    },
    {
      key: TENANT_THROTTLE_KEY,
      label: "Hot Tenant Throttle",
      componentId: "routing-layer",
      valueLabels: { off: "Off", moderate: "Moderate", strict: "Strict" },
    },
    {
      key: SHARD_SPLIT_INITIATED_KEY,
      label: "Shard Split",
      componentId: "partition-a",
      valueLabels: { false: "Not Initiated", true: "Initiated" },
    },
    {
      key: ROUTING_POLICY_KEY,
      label: "Routing Policy",
      componentId: "routing-layer",
      valueLabels: { direct: "Direct", leastLoaded: "Least Loaded" },
    },
    {
      key: HOT_TENANT_CACHE_ENABLED_KEY,
      label: "Hot Tenant Cache",
      componentId: "routing-layer",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: API_INSTANCE_COUNT_KEY,
      label: "API Instances",
      componentId: "api",
    },
  ],
  components: [
    { id: "api", label: "API" },
    { id: "routing-layer", label: "Routing Layer" },
    { id: "partition-a", label: "Partition A" },
    { id: "partition-b", label: "Partition B" },
    { id: "partition-c", label: "Partition C" },
    { id: "partition-d", label: "Partition D" },
  ],
};
