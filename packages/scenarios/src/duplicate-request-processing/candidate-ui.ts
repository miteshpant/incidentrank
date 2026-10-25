import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
} from "./controls";

export const duplicateRequestProcessingCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "serviceLatencyMs", label: "Service Latency", sourceStateKey: "serviceLatencyMs", format: "duration" },
    { key: "duplicateRequestRatePct", label: "Duplicate Request Rate", sourceStateKey: "duplicateRequestRatePct", format: "percentage" },
    { key: "retryVolumePerMin", label: "Retry Volume / min", sourceStateKey: "retryVolumePerMin", format: "number" },
    { key: "sideEffectCount", label: "Side-Effect Count", sourceStateKey: "sideEffectCount", format: "number" },
    { key: "idempotencyHitRatePct", label: "Idempotency Hit Rate", sourceStateKey: "idempotencyHitRatePct", format: "percentage" },
    { key: "customerErrorRatePct", label: "Customer Error Rate", sourceStateKey: "customerErrorRatePct", format: "percentage" },
    { key: "serviceStatus", label: "Service Status", sourceStateKey: "serviceStatus", format: "status" },
  ],
  controls: [
    {
      key: IDEMPOTENCY_KEY_HANDLING_KEY,
      label: "Idempotency Key Handling",
      componentId: "service",
      valueLabels: { disabled: "Disabled", "logged-only": "Logged Only", enforced: "Enforced" },
    },
    {
      key: CLIENT_RETRY_COUNT_KEY,
      label: "Client Retry Count",
      componentId: "client",
    },
    {
      key: CLIENT_TIMEOUT_MS_KEY,
      label: "Client Timeout",
      componentId: "client",
    },
    {
      key: GATEWAY_RETRY_ENABLED_KEY,
      label: "Gateway Retry",
      componentId: "api-gateway",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
      label: "Request Deduplication Window",
      componentId: "api-gateway",
    },
    {
      key: TRANSACTION_HANDLING_KEY,
      label: "Transaction Handling",
      componentId: "database",
      valueLabels: { none: "None", atomic: "Atomic" },
    },
  ],
  components: [
    { id: "client", label: "Client" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "service", label: "Order Service" },
    { id: "database", label: "Database / Side Effect" },
  ],
};
