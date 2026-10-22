import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_TTL_SECONDS_KEY,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
} from "./controls";

export const cacheStampedeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "originRequestRate", label: "Origin Request Rate", sourceStateKey: "originRequestRate", format: "number" },
    { key: "cacheHitRate", label: "Cache Hit Rate", sourceStateKey: "cacheHitRate", format: "percentage" },
    { key: "originLatencyMs", label: "Origin Latency", sourceStateKey: "originLatencyMs", format: "duration" },
    { key: "queuedRequests", label: "Queued Requests", sourceStateKey: "queuedRequests", format: "number" },
    { key: "cacheStatus", label: "Cache Status", sourceStateKey: "cacheStatus", format: "status" },
  ],
  controls: [
    {
      key: CACHE_TTL_SECONDS_KEY,
      label: "Cache TTL",
      componentId: "cache-layer",
      valueLabels: { "10": "10s", "60": "60s", "300": "5m", "900": "15m" },
    },
    {
      key: REQUEST_COALESCING_ENABLED_KEY,
      label: "Request Coalescing",
      componentId: "cache-layer",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: ORIGIN_CONNECTION_POOL_SIZE_KEY,
      label: "Origin Connection Pool Size",
      componentId: "origin-database",
    },
  ],
  components: [
    { id: "api-service", label: "API Service" },
    { id: "cache-layer", label: "Redis Cache" },
    { id: "origin-database", label: "Origin Database" },
    { id: "analytics-writer", label: "Analytics Writer" },
  ],
};
