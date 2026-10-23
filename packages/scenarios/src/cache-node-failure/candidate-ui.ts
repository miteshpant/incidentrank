import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  APPLICATION_CONCURRENCY_KEY,
  CACHE_NODE_COUNT_KEY,
  CACHE_WARMING_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  FAILOVER_MODE_KEY,
} from "./controls";

export const cacheNodeFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "cacheHitRatePercent", label: "Cache Hit Rate", sourceStateKey: "cacheHitRatePercent", format: "percentage" },
    { key: "dbReadsPerSecond", label: "DB Reads / sec", sourceStateKey: "dbReadsPerSecond", format: "number" },
    { key: "cacheNodeLoadPercent", label: "Cache Node Load", sourceStateKey: "cacheNodeLoadPercent", format: "percentage" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "evictionRatePerMinute", label: "Eviction Rate / min", sourceStateKey: "evictionRatePerMinute", format: "number" },
    { key: "cacheStatus", label: "Cache Status", sourceStateKey: "cacheStatus", format: "status" },
  ],
  controls: [
    {
      key: CACHE_NODE_COUNT_KEY,
      label: "Cache Node Count",
      componentId: "distributed-cache",
    },
    {
      key: FAILOVER_MODE_KEY,
      label: "Failover Mode",
      componentId: "distributed-cache",
      valueLabels: { redistribute: "Redistribute to surviving nodes", originFallback: "Fall back to origin" },
    },
    {
      key: DB_REQUEST_PROTECTION_KEY,
      label: "DB Request Protection",
      componentId: "primary-database",
      valueLabels: { off: "Off", rateLimited: "Rate Limited", coalescing: "Request Coalescing" },
    },
    {
      key: CACHE_WARMING_MODE_KEY,
      label: "Cache Warming",
      componentId: "distributed-cache",
      valueLabels: { off: "Off", gradual: "Gradual", aggressive: "Aggressive" },
    },
    {
      key: APPLICATION_CONCURRENCY_KEY,
      label: "Application Concurrency",
      componentId: "api-cluster",
      valueLabels: { low: "Low", medium: "Medium", high: "High" },
    },
  ],
  components: [
    { id: "api-cluster", label: "API Cluster" },
    { id: "distributed-cache", label: "Distributed Cache" },
    { id: "primary-database", label: "Primary Database" },
  ],
};
