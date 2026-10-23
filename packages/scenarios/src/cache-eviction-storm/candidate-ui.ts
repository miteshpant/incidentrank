import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_CONCURRENCY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  DB_PROTECTION_KEY,
  OBJECT_CACHING_POLICY_KEY,
} from "./controls";

export const cacheEvictionStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "evictionRatePerSec", label: "Eviction Rate", sourceStateKey: "evictionRatePerSec", format: "number" },
    { key: "hitRatioPct", label: "Cache Hit Ratio", sourceStateKey: "hitRatioPct", format: "percentage" },
    { key: "memoryUtilizationPct", label: "Memory Utilization", sourceStateKey: "memoryUtilizationPct", format: "percentage" },
    { key: "dbReadsPerSec", label: "DB Reads / sec", sourceStateKey: "dbReadsPerSec", format: "number" },
    { key: "cacheLatencyMs", label: "Cache Latency", sourceStateKey: "cacheLatencyMs", format: "duration" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "cacheStatus", label: "Cache Status", sourceStateKey: "cacheStatus", format: "status" },
  ],
  controls: [
    {
      key: CACHE_MEMORY_MULTIPLIER_KEY,
      label: "Cache Memory",
      componentId: "cache",
      valueLabels: { "1": "1x (baseline)", "2": "2x", "4": "4x", "8": "8x" },
    },
    {
      key: CACHE_TTL_KEY,
      label: "Cache TTL",
      componentId: "cache",
      valueLabels: { "60": "60s", "300": "5min", "900": "15min", "3600": "1hr" },
    },
    {
      key: OBJECT_CACHING_POLICY_KEY,
      label: "Object Caching Policy",
      componentId: "cache",
      valueLabels: { fullObject: "Full Object", projectedFields: "Projected Fields" },
    },
    {
      key: CACHE_ADMISSION_POLICY_KEY,
      label: "Cache Admission Policy",
      componentId: "cache",
      valueLabels: { admitAll: "Admit All", sizeAwareAdmission: "Size-Aware Admission" },
    },
    {
      key: API_CONCURRENCY_KEY,
      label: "API Concurrency",
      componentId: "api",
      valueLabels: { low: "Low", medium: "Medium", high: "High" },
    },
    {
      key: DB_PROTECTION_KEY,
      label: "DB Protection",
      componentId: "database",
      valueLabels: { off: "Off", rateLimited: "Rate Limited", coalescing: "Request Coalescing" },
    },
  ],
  components: [
    { id: "api", label: "API" },
    { id: "cache", label: "Cache" },
    { id: "database", label: "Database" },
  ],
};
