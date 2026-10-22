import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
} from "./controls";

export const cascadingServiceFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "rootServiceErrorRate", label: "User Profile Service Error Rate", sourceStateKey: "rootServiceErrorRate", format: "percentage" },
    { key: "cascadeDepth", label: "Cascade Depth", sourceStateKey: "cascadeDepth", format: "number" },
    { key: "aggregateQueueDepth", label: "Aggregate Queue Depth", sourceStateKey: "aggregateQueueDepth", format: "number" },
    { key: "checkoutSuccessRate", label: "Checkout Success Rate", sourceStateKey: "checkoutSuccessRate", format: "percentage" },
    { key: "chainStatus", label: "Chain Status", sourceStateKey: "chainStatus", format: "status" },
  ],
  controls: [
    {
      key: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
      label: "Circuit Breaker (User Profile Service)",
      componentId: "user-profile-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
      label: "Restart Upstream Services",
      componentId: "checkout-service",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REQUEST_QUEUE_DEPTH_LIMIT_KEY,
      label: "Request Queue Depth Limit",
      componentId: "order-service",
    },
  ],
  components: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "checkout-service", label: "Checkout Service" },
    { id: "order-service", label: "Order Service" },
    { id: "user-profile-service", label: "User Profile Service" },
    { id: "profile-database", label: "Profile Database" },
  ],
};
