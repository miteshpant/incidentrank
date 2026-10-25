import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AGGREGATION_CONCURRENCY_KEY,
  API_CONCURRENCY_KEY,
  CACHE_POLICY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  MAX_RESPONSE_SIZE_KEY,
  PARTIAL_RESPONSE_MODE_KEY,
  RESPONSE_FIELD_SET_MODE_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

export const multiServiceMemoryPressureIncidentCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "aggregatorMemoryUtilizationPct", label: "Aggregator Memory Utilization", sourceStateKey: "aggregatorMemoryUtilizationPct", format: "percentage" },
    { key: "dependencyAMemoryUtilizationPct", label: "Dependency A Memory Utilization", sourceStateKey: "dependencyAMemoryUtilizationPct", format: "percentage" },
    { key: "dependencyBMemoryUtilizationPct", label: "Dependency B Memory Utilization", sourceStateKey: "dependencyBMemoryUtilizationPct", format: "percentage" },
    { key: "dependencyCMemoryUtilizationPct", label: "Dependency C Memory Utilization", sourceStateKey: "dependencyCMemoryUtilizationPct", format: "percentage" },
    { key: "apiServiceMemoryUtilizationPct", label: "API Service Memory Utilization", sourceStateKey: "apiServiceMemoryUtilizationPct", format: "percentage" },
    { key: "gcPauseMsP99", label: "GC Pause (p99)", sourceStateKey: "gcPauseMsP99", format: "duration" },
    { key: "restartChurnCount", label: "Restart / OOM Churn Count", sourceStateKey: "restartChurnCount", format: "number" },
    { key: "responsePayloadSizeKb", label: "Response Payload Size", sourceStateKey: "responsePayloadSizeKb", format: "number" },
    { key: "customerEnrichmentCompletenessPct", label: "Customer Enrichment Completeness", sourceStateKey: "customerEnrichmentCompletenessPct", format: "percentage" },
    { key: "errorRatePct", label: "Error Rate", sourceStateKey: "errorRatePct", format: "percentage" },
    { key: "aggregatorStatus", label: "Aggregator Status", sourceStateKey: "aggregatorStatus", format: "status" },
  ],
  controls: [
    {
      key: RESPONSE_FIELD_SET_MODE_KEY,
      label: "Response Field Set",
      componentId: "aggregator",
      valueLabels: { full: "Full", reduced: "Reduced" },
    },
    {
      key: AGGREGATION_CONCURRENCY_KEY,
      label: "Aggregation Concurrency",
      componentId: "aggregator",
    },
    {
      key: MAX_RESPONSE_SIZE_KEY,
      label: "Max Response Size",
      componentId: "aggregator",
      valueLabels: { unlimited: "Unlimited", "256kb": "256 KB", "64kb": "64 KB" },
    },
    {
      key: API_CONCURRENCY_KEY,
      label: "API Concurrency",
      componentId: "api-service",
    },
    {
      key: DEPENDENCY_A_INSTANCE_COUNT_KEY,
      label: "Dependency A Instance Count",
      componentId: "dependency-a",
    },
    {
      key: CACHE_POLICY_KEY,
      label: "Aggregator Response Cache",
      componentId: "aggregator",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: WORKER_COUNT_KEY,
      label: "Aggregator Worker Count",
      componentId: "aggregator",
    },
    {
      key: PARTIAL_RESPONSE_MODE_KEY,
      label: "Partial Response Mode",
      componentId: "aggregator",
      valueLabels: { disabled: "Disabled", enabled: "Enabled" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "gateway", label: "Gateway" },
    { id: "api-service", label: "API Service" },
    { id: "aggregator", label: "Aggregator" },
    { id: "dependency-a", label: "Dependency A" },
    { id: "dependency-b", label: "Dependency B" },
    { id: "dependency-c", label: "Dependency C" },
  ],
};
