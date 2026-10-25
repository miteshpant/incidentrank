import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AUTH_MIDDLEWARE_MODE_KEY,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
} from "./controls";

export const apiGatewaySaturationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "gatewayQueueDepth", label: "Gateway Queue Depth", sourceStateKey: "gatewayQueueDepth", format: "number" },
    { key: "gatewayCpuUtilization", label: "Gateway CPU", sourceStateKey: "gatewayCpuUtilization", format: "percentage" },
    { key: "backendUtilization", label: "Backend Utilization", sourceStateKey: "backendUtilization", format: "percentage" },
    { key: "gatewayConnectionCount", label: "Gateway Connection Count", sourceStateKey: "gatewayConnectionCount", format: "number" },
    { key: "downstreamLatencyMs", label: "Downstream Latency", sourceStateKey: "downstreamLatencyMs", format: "duration" },
    { key: "customerLatencyMs", label: "Customer Latency", sourceStateKey: "customerLatencyMs", format: "duration" },
    { key: "gatewayStatus", label: "Gateway Status", sourceStateKey: "gatewayStatus", format: "status" },
  ],
  controls: [
    {
      key: GATEWAY_CAPACITY_KEY,
      label: "Gateway Capacity (replicas)",
      componentId: "api-gateway",
    },
    {
      key: CONNECTION_REUSE_ENABLED_KEY,
      label: "Upstream Connection Reuse",
      componentId: "api-gateway",
      valueLabels: { false: "Per-Request", true: "Reused" },
    },
    {
      key: ROUTE_COMPLEXITY_KEY,
      label: "Route Matching",
      componentId: "api-gateway",
      valueLabels: { verbose: "Verbose", simplified: "Simplified" },
    },
    {
      key: RATE_LIMIT_AT_GATEWAY_KEY,
      label: "Rate Limit (req/s, 0 = off)",
      componentId: "api-gateway",
    },
    {
      key: AUTH_MIDDLEWARE_MODE_KEY,
      label: "Auth Middleware Mode",
      componentId: "api-gateway",
      valueLabels: { full: "Full Introspection", lightweight: "Lightweight (Cached)", bypass: "Bypassed" },
    },
    {
      key: BACKEND_CAPACITY_KEY,
      label: "Service Fleet Capacity (replicas)",
      componentId: "service-fleet",
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "service-fleet", label: "Service Fleet" },
  ],
};
