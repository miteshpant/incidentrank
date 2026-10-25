import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_INSTANCE_COUNT_KEY,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  TTL_JITTER_ENABLED_KEY,
} from "./controls";

export const cacheRevalidationHerdCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "cacheMissRatePct", label: "Cache Miss Rate", sourceStateKey: "cacheMissRatePct", format: "percentage" },
    { key: "concurrentRefreshes", label: "Concurrent Refreshes", sourceStateKey: "concurrentRefreshes", format: "number" },
    { key: "originQps", label: "Origin QPS", sourceStateKey: "originQps", format: "number" },
    { key: "originLatencyMs", label: "Origin Latency", sourceStateKey: "originLatencyMs", format: "duration" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "refreshFailureRatePct", label: "Refresh Failure Rate", sourceStateKey: "refreshFailureRatePct", format: "percentage" },
    { key: "cacheHitRatioPct", label: "Cache Hit Ratio", sourceStateKey: "cacheHitRatioPct", format: "percentage" },
    { key: "originStatus", label: "Origin Status", sourceStateKey: "originStatus", format: "status" },
  ],
  controls: [
    {
      key: TTL_JITTER_ENABLED_KEY,
      label: "TTL Jitter",
      componentId: "shared-cache",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: SINGLE_FLIGHT_COALESCING_KEY,
      label: "Single-Flight Coalescing",
      componentId: "shared-cache",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: STALE_WHILE_REVALIDATE_ENABLED_KEY,
      label: "Stale-While-Revalidate",
      componentId: "shared-cache",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REFRESH_CONCURRENCY_LIMIT_KEY,
      label: "Refresh Concurrency Limit",
      componentId: "shared-cache",
    },
    {
      key: API_INSTANCE_COUNT_KEY,
      label: "API Instances",
      componentId: "api-fleet",
    },
    {
      key: REFRESH_RETRY_BACKOFF_KEY,
      label: "Refresh Retry Backoff (ms)",
      componentId: "origin",
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-fleet", label: "API Fleet" },
    { id: "shared-cache", label: "Shared Cache" },
    { id: "origin", label: "Origin / Catalog Service" },
  ],
};
