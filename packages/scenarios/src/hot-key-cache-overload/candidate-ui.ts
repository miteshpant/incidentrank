import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_CLUSTER_SIZE_KEY,
  CACHE_TTL_SECONDS_KEY,
  KEY_REPLICATION_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
} from "./controls";

export const hotKeyCacheOverloadCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "hotKeyTrafficRps", label: "Hot Key Traffic", sourceStateKey: "hotKeyTrafficRps", format: "number" },
    { key: "hotShardUtilizationPct", label: "Hot Shard Utilization", sourceStateKey: "hotShardUtilizationPct", format: "percentage" },
    { key: "hotShardLatencyMs", label: "Hot Shard Latency", sourceStateKey: "hotShardLatencyMs", format: "duration" },
    { key: "otherShardsUtilizationPct", label: "Other Shards Utilization", sourceStateKey: "otherShardsUtilizationPct", format: "percentage" },
    { key: "otherShardsLatencyMs", label: "Other Shards Latency", sourceStateKey: "otherShardsLatencyMs", format: "duration" },
    { key: "cacheHitRatePct", label: "Cache Hit Rate", sourceStateKey: "cacheHitRatePct", format: "percentage" },
    { key: "originRequestRatePerSec", label: "Origin Request Rate", sourceStateKey: "originRequestRatePerSec", format: "number" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "hotShardStatus", label: "Hot Shard Status", sourceStateKey: "hotShardStatus", format: "status" },
  ],
  controls: [
    {
      key: KEY_REPLICATION_ENABLED_KEY,
      label: "Hot Key Replication",
      componentId: "cache-hot-shard",
      valueLabels: { false: "Off", true: "Replicated" },
    },
    {
      key: REQUEST_COALESCING_ENABLED_KEY,
      label: "Request Coalescing",
      componentId: "api",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: LOCAL_API_CACHE_ENABLED_KEY,
      label: "Local API-Tier Cache",
      componentId: "api",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CACHE_TTL_SECONDS_KEY,
      label: "Cache TTL (seconds)",
      componentId: "cache-hot-shard",
    },
    {
      key: CACHE_CLUSTER_SIZE_KEY,
      label: "Cache Cluster Size",
      componentId: "cache-other-shards",
    },
    {
      key: ORIGIN_PROTECTION_ENABLED_KEY,
      label: "Origin Protection",
      componentId: "origin",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: SHARDING_STRATEGY_KEY,
      label: "Sharding Strategy",
      componentId: "cache-other-shards",
      valueLabels: { consistentHash: "Consistent Hash", roundRobin: "Round Robin" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "cache-hot-shard", label: "Cache Shard (Hot Key)" },
    { id: "cache-other-shards", label: "Cache Cluster (Other Shards)" },
    { id: "origin", label: "Origin Service" },
  ],
};
