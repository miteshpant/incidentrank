import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
} from "./controls";

export const cacheInvalidationAcrossRegionsCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "globalApiSuccessRatePct", label: "Global API Success", sourceStateKey: "globalApiSuccessRatePct", format: "percentage" },
    { key: "usCacheHitRatePct", label: "US Cache Hit Rate", sourceStateKey: "usCacheHitRatePct", format: "percentage" },
    { key: "usStaleReadRatePct", label: "US Stale-Read Rate", sourceStateKey: "usStaleReadRatePct", format: "percentage" },
    { key: "usFreshnessStatus", label: "US Freshness Status", sourceStateKey: "usFreshnessStatus", format: "status" },
    { key: "euCacheHitRatePct", label: "EU Cache Hit Rate", sourceStateKey: "euCacheHitRatePct", format: "percentage" },
    { key: "euRevalidationStormRatePerMin", label: "EU Revalidation Storm Rate (req/min)", sourceStateKey: "euRevalidationStormRatePerMin", format: "number" },
    { key: "euInvalidationStormStatus", label: "EU Invalidation Storm Status", sourceStateKey: "euInvalidationStormStatus", format: "status" },
    { key: "apacCacheHitRatePct", label: "APAC Cache Hit Rate", sourceStateKey: "apacCacheHitRatePct", format: "percentage" },
    { key: "apacFreshnessStatus", label: "APAC Freshness Status", sourceStateKey: "apacFreshnessStatus", format: "status" },
    { key: "originRequestsPerSec", label: "Origin Requests/sec", sourceStateKey: "originRequestsPerSec", format: "number" },
    { key: "originLatencyMs", label: "Origin Latency (ms)", sourceStateKey: "originLatencyMs", format: "duration" },
    { key: "originStatus", label: "Origin Status", sourceStateKey: "originStatus", format: "status" },
    { key: "staleServesPastFreshnessBoundCount", label: "Stale Serves Past Freshness Bound (historical)", sourceStateKey: "staleServesPastFreshnessBoundCount", format: "number" },
    { key: "invalidationSystemStatus", label: "Invalidation System Status", sourceStateKey: "invalidationSystemStatus", format: "status" },
  ],
  controls: [
    {
      key: US_CACHE_MODE_KEY,
      label: "US Cache Mode",
      componentId: "us-cache",
      valueLabels: { caching: "Caching (default)", bypass: "Bypass" },
    },
    {
      key: EU_INVALIDATION_REPLAY_MODE_KEY,
      label: "EU Invalidation Replay Mode",
      componentId: "eu-cache",
      valueLabels: { "blind-replay": "Blind Replay (default)", deduplicated: "Deduplicated" },
    },
    {
      key: GLOBAL_CACHE_BYPASS_KEY,
      label: "Global Cache Bypass",
      componentId: "global-api",
      valueLabels: { false: "Off", true: "On (all regions)" },
    },
    {
      key: ORIGIN_CONCURRENCY_KEY,
      label: "Origin Concurrency",
      componentId: "origin-store",
      valueLabels: { normal: "Normal", high: "High" },
    },
    {
      key: STALE_WHILE_REVALIDATE_KEY,
      label: "Stale-While-Revalidate (US)",
      componentId: "us-cache",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: US_TTL_SECONDS_KEY,
      label: "US Cache TTL (seconds)",
      componentId: "us-cache",
      valueLabels: { "30": "30s (default)", "300": "300s", "900": "900s" },
    },
    {
      key: REGIONAL_INVALIDATOR_ISOLATION_KEY,
      label: "Regional Invalidator Isolation",
      componentId: "invalidation-stream",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REFRESH_CONCURRENCY_KEY,
      label: "Refresh Concurrency",
      componentId: "origin-store",
      valueLabels: { low: "Low (default)", high: "High" },
    },
  ],
  components: [
    { id: "global-api", label: "Global API" },
    { id: "us-cache", label: "US Cache" },
    { id: "eu-cache", label: "EU Cache" },
    { id: "apac-cache", label: "APAC Cache" },
    { id: "origin-store", label: "Origin Store" },
    { id: "invalidation-stream", label: "Invalidation Stream / Publisher" },
  ],
};
