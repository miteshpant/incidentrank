import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHING_ENABLED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
} from "./controls";

export const dependencyRateLimitExhaustionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "quotaRemainingPct", label: "Quota Remaining", sourceStateKey: "quotaRemainingPct", format: "percentage" },
    { key: "dependency429RatePerMin", label: "Dependency 429 Rate / min", sourceStateKey: "dependency429RatePerMin", format: "number" },
    { key: "applicationSuccessRatePct", label: "Application Success Rate", sourceStateKey: "applicationSuccessRatePct", format: "percentage" },
    { key: "retryVolumePerMin", label: "Retry Volume / min", sourceStateKey: "retryVolumePerMin", format: "number" },
    { key: "cacheHitRatePct", label: "Cache Hit Rate", sourceStateKey: "cacheHitRatePct", format: "percentage" },
    { key: "requestPriorityMixPct", label: "Priority Traffic Mix", sourceStateKey: "requestPriorityMixPct", format: "percentage" },
    { key: "dependencyCallVolumePerMin", label: "Dependency Call Volume / min", sourceStateKey: "dependencyCallVolumePerMin", format: "number" },
    { key: "quotaStatus", label: "Quota Status", sourceStateKey: "quotaStatus", format: "status" },
  ],
  controls: [
    {
      key: CACHING_ENABLED_KEY,
      label: "Response Caching",
      componentId: "aggregation-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REQUEST_COALESCING_ENABLED_KEY,
      label: "Request Coalescing",
      componentId: "aggregation-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: RETRY_AGGRESSIVENESS_KEY,
      label: "Retry Aggressiveness",
      componentId: "aggregation-service",
      valueLabels: { off: "Off", normal: "Normal", aggressive: "Aggressive" },
    },
    {
      key: PRIORITY_TRAFFIC_POLICY_KEY,
      label: "Priority Traffic Policy",
      componentId: "aggregation-service",
      valueLabels: { "all-equal": "All Equal", "priority-only": "Priority Only" },
    },
    {
      key: OPTIONAL_FEATURE_SUPPRESSED_KEY,
      label: "Optional Enrichment Feature",
      componentId: "api",
      valueLabels: { false: "Enabled", true: "Suppressed" },
    },
    {
      key: DEPENDENCY_CONCURRENCY_KEY,
      label: "Dependency Concurrency",
      componentId: "aggregation-service",
      valueLabels: { high: "High", capped: "Capped" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "aggregation-service", label: "Aggregation Service" },
    { id: "third-party-dependency", label: "Third-Party Dependency" },
  ],
};
