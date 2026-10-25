import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CANCELLATION_PROPAGATION_KEY,
  CIRCUIT_BREAKER_KEY,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_CONCURRENCY_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
} from "./controls";

export const crossServiceRetryAmplificationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "customerQps", label: "Original Customer QPS", sourceStateKey: "customerQps", format: "number" },
    { key: "providerQps", label: "Provider-Facing QPS", sourceStateKey: "providerQps", format: "number" },
    {
      key: "effectiveAmplificationFactor",
      label: "Effective Amplification Factor",
      sourceStateKey: "effectiveAmplificationFactor",
      format: "number",
    },
    { key: "inFlightRequests", label: "In-Flight Requests", sourceStateKey: "inFlightRequests", format: "number" },
    { key: "customerSuccessRate", label: "Customer Success Rate", sourceStateKey: "customerSuccessRate", format: "percentage" },
    { key: "providerLatencyMs", label: "Provider Latency", sourceStateKey: "providerLatencyMs", format: "duration" },
    {
      key: "providerConnectionUtilizationPercent",
      label: "Provider Connection Utilization",
      sourceStateKey: "providerConnectionUtilizationPercent",
      format: "percentage",
    },
    { key: "zombieRequestCount", label: "Zombie Requests", sourceStateKey: "zombieRequestCount", format: "number" },
  ],
  controls: [
    { key: GATEWAY_RETRIES_KEY, label: "Gateway Retries", componentId: "gateway" },
    { key: SERVICE_A_RETRIES_KEY, label: "Service A Retries", componentId: "service-a" },
    { key: SERVICE_B_RETRIES_KEY, label: "Service B Retries", componentId: "service-b" },
    { key: SERVICE_C_RETRIES_KEY, label: "Service C Retries", componentId: "service-c" },
    {
      key: SERVICE_C_TIMEOUT_SECONDS_KEY,
      label: "Service C Timeout (seconds)",
      componentId: "service-c",
    },
    {
      key: CIRCUIT_BREAKER_KEY,
      label: "Service C Circuit Breaker",
      componentId: "service-c",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: CANCELLATION_PROPAGATION_KEY,
      label: "Cancellation Propagation",
      componentId: "gateway",
      valueLabels: { off: "Off", on: "On" },
    },
    { key: SERVICE_C_CONCURRENCY_KEY, label: "Service C Concurrency", componentId: "service-c" },
  ],
  components: [
    { id: "client", label: "Client" },
    { id: "gateway", label: "Gateway" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
    { id: "external-provider", label: "External Provider" },
  ],
};
