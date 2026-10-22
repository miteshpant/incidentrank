import type { CandidateUIDescriptor } from "../candidate-ui";
import { CIRCUIT_BREAKER_ENABLED_KEY, FALLBACK_RESPONSE_ENABLED_KEY, REQUEST_TIMEOUT_MS_KEY } from "./controls";

export const downstreamDependencyFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "callingServiceThreadPoolUtilization",
      label: "Thread Pool Utilization",
      sourceStateKey: "callingServiceThreadPoolUtilization",
      format: "percentage",
    },
    { key: "requestLatencyP99Ms", label: "Request Latency (P99)", sourceStateKey: "requestLatencyP99Ms", format: "duration" },
    { key: "failedRequestRate", label: "Failed Request Rate", sourceStateKey: "failedRequestRate", format: "percentage" },
    { key: "queuedRequests", label: "Queued Requests", sourceStateKey: "queuedRequests", format: "number" },
    { key: "callingServiceStatus", label: "Calling Service Status", sourceStateKey: "callingServiceStatus", format: "status" },
  ],
  controls: [
    {
      key: CIRCUIT_BREAKER_ENABLED_KEY,
      label: "Circuit Breaker",
      componentId: "calling-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REQUEST_TIMEOUT_MS_KEY,
      label: "Request Timeout",
      componentId: "calling-service",
      valueLabels: { "500": "500ms", "2000": "2s", "8000": "8s", "20000": "20s" },
    },
    {
      key: FALLBACK_RESPONSE_ENABLED_KEY,
      label: "Fallback Response",
      componentId: "fallback-cache",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "calling-service", label: "Calling Service" },
    { id: "downstream-service", label: "Downstream Service" },
    { id: "fallback-cache", label: "Fallback Cache" },
  ],
};
