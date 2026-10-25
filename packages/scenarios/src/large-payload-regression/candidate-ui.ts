import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_INSTANCE_COUNT_KEY,
  COMPRESSION_ENABLED_KEY,
  PAGE_SIZE_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  RESPONSE_PROJECTION_ENABLED_KEY,
} from "./controls";

export const largePayloadRegressionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "responsePayloadSizeKb", label: "Response Payload Size", sourceStateKey: "responsePayloadSizeKb", format: "number" },
    { key: "p99LatencyMs", label: "p99 Latency", sourceStateKey: "p99LatencyMs", format: "duration" },
    { key: "apiMemoryUtilization", label: "API Memory Utilization", sourceStateKey: "apiMemoryUtilization", format: "percentage" },
    { key: "networkUtilizationMbps", label: "Network Utilization", sourceStateKey: "networkUtilizationMbps", format: "number" },
    { key: "errorRatePercent", label: "Error Rate", sourceStateKey: "errorRatePercent", format: "percentage" },
    { key: "throughputRps", label: "Throughput", sourceStateKey: "throughputRps", format: "number" },
    { key: "apiStatus", label: "API Status", sourceStateKey: "apiStatus", format: "status" },
  ],
  controls: [
    {
      key: RESPONSE_PROJECTION_ENABLED_KEY,
      label: "Response Projection",
      componentId: "api-service",
      valueLabels: { false: "Full Shape", true: "Projected Fields" },
    },
    {
      key: PAGE_SIZE_KEY,
      label: "Page Size",
      componentId: "api-service",
    },
    {
      key: COMPRESSION_ENABLED_KEY,
      label: "Response Compression",
      componentId: "gateway",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: PAYLOAD_SIZE_LIMIT_KEY,
      label: "Payload Size Limit",
      componentId: "gateway",
      valueLabels: { unlimited: "Unlimited", "512kb": "512 KB", "128kb": "128 KB" },
    },
    {
      key: API_INSTANCE_COUNT_KEY,
      label: "API Instances",
      componentId: "api-service",
    },
    {
      key: RESPONSE_CACHE_ENABLED_KEY,
      label: "Response Cache",
      componentId: "api-service",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "gateway", label: "Gateway" },
    { id: "api-service", label: "API Service" },
    { id: "storage", label: "Storage / Database" },
  ],
};
