import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  REQUEST_CONCURRENCY_KEY,
  RETRY_BACKOFF_STRATEGY_KEY,
} from "./controls";

export const rateLimitFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "rateLimitViolationRate", label: "429 Rate", sourceStateKey: "rateLimitViolationRate", format: "percentage" },
    { key: "effectiveThroughput", label: "Effective Throughput", sourceStateKey: "effectiveThroughput", format: "number" },
    { key: "retryQueueDepth", label: "Retry Queue Depth", sourceStateKey: "retryQueueDepth", format: "number" },
    { key: "throttleWindowRemainingMs", label: "Throttle Window Remaining", sourceStateKey: "throttleWindowRemainingMs", format: "duration" },
    { key: "rateLimitStatus", label: "Rate Limit Status", sourceStateKey: "rateLimitStatus", format: "status" },
  ],
  controls: [
    {
      key: RETRY_BACKOFF_STRATEGY_KEY,
      label: "Retry Backoff Strategy",
      componentId: "client-service",
      valueLabels: {
        none: "None",
        "fixed-delay": "Fixed Delay",
        "exponential-with-jitter": "Exponential with Jitter",
      },
    },
    {
      key: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
      label: "Client-Side Rate Limiting",
      componentId: "token-bucket-limiter",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: REQUEST_CONCURRENCY_KEY,
      label: "Request Concurrency",
      componentId: "client-service",
    },
  ],
  components: [
    { id: "client-service", label: "Client Service" },
    { id: "token-bucket-limiter", label: "Token Bucket Limiter" },
    { id: "payment-verification-api", label: "Payment Verification API" },
    { id: "retry-queue", label: "Retry Queue" },
  ],
};
