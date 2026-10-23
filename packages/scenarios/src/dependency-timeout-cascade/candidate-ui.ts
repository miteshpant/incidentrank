import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  API_TO_A_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
} from "./controls";

export const dependencyTimeoutCascadeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "serviceCLatencyMs", label: "Service C Latency", sourceStateKey: "serviceCLatencyMs", format: "duration" },
    { key: "serviceBLatencyMs", label: "Service B Latency", sourceStateKey: "serviceBLatencyMs", format: "duration" },
    { key: "serviceALatencyMs", label: "Service A Latency", sourceStateKey: "serviceALatencyMs", format: "duration" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "timeoutRatePercent", label: "Timeout Rate", sourceStateKey: "timeoutRatePercent", format: "percentage" },
    { key: "serviceBOutstandingRequests", label: "Service B Outstanding Requests", sourceStateKey: "serviceBOutstandingRequests", format: "number" },
    { key: "serviceAOutstandingRequests", label: "Service A Outstanding Requests", sourceStateKey: "serviceAOutstandingRequests", format: "number" },
    { key: "apiOutstandingRequests", label: "API Outstanding Requests", sourceStateKey: "apiOutstandingRequests", format: "number" },
    { key: "serviceBPoolUtilization", label: "Service B Connection Pool", sourceStateKey: "serviceBPoolUtilization", format: "percentage" },
    { key: "serviceAPoolUtilization", label: "Service A Connection Pool", sourceStateKey: "serviceAPoolUtilization", format: "percentage" },
    { key: "apiPoolUtilization", label: "API Connection Pool", sourceStateKey: "apiPoolUtilization", format: "percentage" },
    { key: "serviceCConnectionsInUse", label: "Service C Connections In Use", sourceStateKey: "serviceCConnectionsInUse", format: "percentage" },
    { key: "customerSuccessRatePercent", label: "Customer Success Rate", sourceStateKey: "customerSuccessRatePercent", format: "percentage" },
    { key: "chainStatus", label: "Chain Status", sourceStateKey: "chainStatus", format: "status" },
  ],
  controls: [
    {
      key: API_TO_A_TIMEOUT_MS_KEY,
      label: "API → Service A Timeout",
      componentId: "api",
    },
    {
      key: A_TO_B_TIMEOUT_MS_KEY,
      label: "Service A → Service B Timeout",
      componentId: "service-a",
    },
    {
      key: B_TO_C_TIMEOUT_MS_KEY,
      label: "Service B → Service C Timeout",
      componentId: "service-b",
    },
    {
      key: B_TO_C_RETRY_COUNT_KEY,
      label: "Service B → Service C Retries",
      componentId: "service-b",
    },
    {
      key: CIRCUIT_BREAKER_B_TO_C_KEY,
      label: "Circuit Breaker (B → C)",
      componentId: "service-b",
      valueLabels: { false: "Closed", true: "Open" },
    },
    {
      key: SERVICE_A_CONCURRENCY_LIMIT_KEY,
      label: "Service A Concurrency Limit",
      componentId: "service-a",
    },
  ],
  components: [
    { id: "client", label: "Client" },
    { id: "api", label: "API" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
  ],
};
