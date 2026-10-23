import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ENRICHMENT_CALL_ENABLED_KEY,
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  PARTIAL_RESPONSE_POLICY_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
} from "./controls";

export const fanOutRequestExplosionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestsPerUserRequest", label: "Downstream Calls / Request", sourceStateKey: "requestsPerUserRequest", format: "number" },
    { key: "downstreamQpsServiceE", label: "Service E QPS", sourceStateKey: "downstreamQpsServiceE", format: "number" },
    { key: "downstreamQpsServiceA", label: "Service A QPS", sourceStateKey: "downstreamQpsServiceA", format: "number" },
    { key: "aggregatorLatencyMs", label: "Aggregator Latency", sourceStateKey: "aggregatorLatencyMs", format: "duration" },
    { key: "partialResponseRatePercent", label: "Partial Response Rate", sourceStateKey: "partialResponseRatePercent", format: "percentage" },
    { key: "serviceESaturationPercent", label: "Service E Saturation", sourceStateKey: "serviceESaturationPercent", format: "percentage" },
    { key: "serviceASaturationPercent", label: "Service A Saturation", sourceStateKey: "serviceASaturationPercent", format: "percentage" },
    { key: "customerSuccessRatePercent", label: "Customer Success Rate", sourceStateKey: "customerSuccessRatePercent", format: "percentage" },
    { key: "aggregatorStatus", label: "Aggregator Status", sourceStateKey: "aggregatorStatus", format: "status" },
  ],
  controls: [
    {
      key: FAN_OUT_CONCURRENCY_LIMIT_KEY,
      label: "Fan-Out Concurrency Limit",
      componentId: "aggregator",
    },
    {
      key: ENRICHMENT_CALL_ENABLED_KEY,
      label: "Recommendation Enrichment Call",
      componentId: "service-e",
      valueLabels: { false: "Excluded", true: "Included" },
    },
    {
      key: PARTIAL_RESPONSE_POLICY_KEY,
      label: "Partial Response Policy",
      componentId: "aggregator",
      valueLabels: { failWhole: "Fail Whole Request", partialAllowed: "Allow Partial Response" },
    },
    {
      key: RESPONSE_CACHE_ENABLED_KEY,
      label: "Enrichment Response Cache",
      componentId: "service-e",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REQUEST_BATCHING_ENABLED_KEY,
      label: "Request Batching",
      componentId: "aggregator",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: SERVICE_E_TIMEOUT_MS_KEY,
      label: "Service E Timeout",
      componentId: "service-e",
    },
  ],
  components: [
    { id: "api", label: "API" },
    { id: "aggregator", label: "Aggregator" },
    { id: "service-a", label: "Service A (Pricing)" },
    { id: "service-b", label: "Service B (Inventory)" },
    { id: "service-c", label: "Service C (Shipping Estimate)" },
    { id: "service-d", label: "Service D (Tax Calculation)" },
    { id: "service-e", label: "Service E (Recommendation Enrichment)" },
  ],
};
