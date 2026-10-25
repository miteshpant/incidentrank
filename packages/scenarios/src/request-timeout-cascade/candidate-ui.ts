import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
} from "./controls";

export const requestTimeoutCascadeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "dependencyLatencyMs", label: "Dependency Latency", sourceStateKey: "dependencyLatencyMs", format: "duration" },
    { key: "timeoutRateByLayerPercent", label: "Timeout Rate", sourceStateKey: "timeoutRateByLayerPercent", format: "percentage" },
    { key: "inFlightRequests", label: "In-Flight Requests", sourceStateKey: "inFlightRequests", format: "number" },
    { key: "abandonedInFlightRequests", label: "Abandoned In-Flight Requests", sourceStateKey: "abandonedInFlightRequests", format: "number" },
    { key: "connectionUtilizationPercent", label: "Connection Utilization", sourceStateKey: "connectionUtilizationPercent", format: "percentage" },
    { key: "retryVolumePerSecond", label: "Retry Volume / sec", sourceStateKey: "retryVolumePerSecond", format: "number" },
    { key: "customerLatencyMs", label: "Customer Latency", sourceStateKey: "customerLatencyMs", format: "duration" },
    { key: "customerSuccessRatePercent", label: "Customer Success Rate", sourceStateKey: "customerSuccessRatePercent", format: "percentage" },
    { key: "chainStatus", label: "Chain Status", sourceStateKey: "chainStatus", format: "status" },
  ],
  controls: [
    {
      key: GATEWAY_TO_A_TIMEOUT_MS_KEY,
      label: "Gateway → Service A Timeout",
      componentId: "gateway",
    },
    {
      key: A_TO_B_TIMEOUT_MS_KEY,
      label: "Service A → Service B Timeout",
      componentId: "service-a",
    },
    {
      key: B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
      label: "Service B → Dependency Timeout",
      componentId: "service-b",
    },
    {
      key: GATEWAY_RETRY_COUNT_KEY,
      label: "Gateway Retry Count",
      componentId: "gateway",
    },
    {
      key: REQUEST_CANCELLATION_ENABLED_KEY,
      label: "Request Cancellation Propagation",
      componentId: "gateway",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
      label: "Circuit Breaker (B → Dependency)",
      componentId: "service-b",
      valueLabels: { false: "Closed", true: "Open" },
    },
  ],
  components: [
    { id: "client", label: "Client" },
    { id: "gateway", label: "Gateway" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "dependency", label: "Dependency" },
  ],
};
