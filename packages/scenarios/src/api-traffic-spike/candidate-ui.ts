import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_INSTANCE_COUNT_KEY,
  CACHE_BEHAVIOR_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
  RATE_LIMIT_MODE_KEY,
  REQUEST_QUEUE_MODE_KEY,
} from "./controls";

export const apiTrafficSpikeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestRatePerSec", label: "Request Rate", sourceStateKey: "requestRatePerSec", format: "number" },
    { key: "apiCpuUtilization", label: "API CPU", sourceStateKey: "apiCpuUtilization", format: "percentage" },
    { key: "requestQueueDepth", label: "Request Queue Depth", sourceStateKey: "requestQueueDepth", format: "number" },
    { key: "dbConnectionUtilization", label: "DB Connection Utilization", sourceStateKey: "dbConnectionUtilization", format: "percentage" },
    { key: "cacheHitRatePct", label: "Cache Hit Rate", sourceStateKey: "cacheHitRatePct", format: "percentage" },
    { key: "latencyMs", label: "Request Latency", sourceStateKey: "latencyMs", format: "duration" },
    { key: "errorRatePct", label: "Error Rate", sourceStateKey: "errorRatePct", format: "percentage" },
    { key: "dbStatus", label: "Database Status", sourceStateKey: "dbStatus", format: "status" },
  ],
  controls: [
    {
      key: API_INSTANCE_COUNT_KEY,
      label: "API Instances",
      componentId: "api-fleet",
    },
    {
      key: DB_CONNECTION_POOL_SIZE_KEY,
      label: "DB Connection Pool Size",
      componentId: "database",
    },
    {
      key: DB_PROTECTION_MODE_KEY,
      label: "Database Protection Mode",
      componentId: "database",
      valueLabels: { relaxed: "Relaxed", strict: "Strict" },
    },
    {
      key: CACHE_BEHAVIOR_KEY,
      label: "Cache Behavior",
      componentId: "cache",
      valueLabels: { shortTtl: "Short TTL", extendedTtl: "Extended TTL" },
    },
    {
      key: REQUEST_QUEUE_MODE_KEY,
      label: "Request Queue Mode",
      componentId: "api-fleet",
      valueLabels: { unbounded: "Unbounded", bounded: "Bounded" },
    },
    {
      key: RATE_LIMIT_MODE_KEY,
      label: "Rate Limiting",
      componentId: "load-balancer",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: NON_CRITICAL_ENDPOINT_ENABLED_KEY,
      label: "Non-Critical Reporting Endpoint",
      componentId: "api-fleet",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "api-fleet", label: "API Fleet" },
    { id: "database", label: "Database" },
    { id: "cache", label: "Cache" },
  ],
};
