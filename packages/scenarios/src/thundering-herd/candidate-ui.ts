import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_GATEWAY_INSTANCES_KEY,
  CLIENT_JITTER_ENABLED_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
} from "./controls";

export const thunderingHerdCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestsPerSecond", label: "Requests / Second", sourceStateKey: "requestsPerSecond", format: "number" },
    { key: "gatewayErrorRate", label: "Gateway Error Rate", sourceStateKey: "gatewayErrorRate", format: "percentage" },
    { key: "authServiceLatencyMs", label: "Auth Service Latency", sourceStateKey: "authServiceLatencyMs", format: "duration" },
    { key: "rejectedRequestCount", label: "Rejected Requests", sourceStateKey: "rejectedRequestCount", format: "number" },
    { key: "gatewayStatus", label: "Gateway Status", sourceStateKey: "gatewayStatus", format: "status" },
  ],
  controls: [
    {
      key: CLIENT_JITTER_ENABLED_KEY,
      label: "Client Schedule Jitter",
      componentId: "client-fleet",
      valueLabels: { false: "Off", true: "On" },
    },
    { key: API_GATEWAY_INSTANCES_KEY, label: "API Gateway Instances", componentId: "api-gateway" },
    {
      key: REQUEST_QUEUEING_ENABLED_KEY,
      label: "Request Queueing",
      componentId: "api-gateway",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "client-fleet", label: "Client Fleet" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-service", label: "Auth Service" },
    { id: "config-service", label: "Config Service" },
  ],
};
