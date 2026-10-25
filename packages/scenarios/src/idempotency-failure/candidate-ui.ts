import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const idempotencyFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "duplicateSideEffectCount",
      label: "Duplicate Side Effects",
      sourceStateKey: "duplicateSideEffectCount",
      format: "number",
    },
    {
      key: "idempotencyStoreHealth",
      label: "Idempotency Store Health",
      sourceStateKey: "idempotencyStoreHealth",
      format: "status",
    },
    {
      key: "retryCountPerMin",
      label: "Retry Count / min",
      sourceStateKey: "retryCountPerMin",
      format: "number",
    },
    {
      key: "requestSuccessRatePct",
      label: "Request Success Rate",
      sourceStateKey: "requestSuccessRatePct",
      format: "percentage",
    },
    {
      key: "externalSideEffectRatePerMin",
      label: "External Side-Effect Rate / min",
      sourceStateKey: "externalSideEffectRatePerMin",
      format: "number",
    },
  ],
  controls: [
    {
      key: STORAGE_MODE_KEY,
      label: "Idempotency Storage Mode",
      componentId: "idempotency-store",
      valueLabels: { "single-node": "Single Node", replicated: "Replicated" },
    },
    {
      key: KEY_TTL_SECONDS_KEY,
      label: "Idempotency Key TTL (seconds)",
      componentId: "idempotency-store",
    },
    {
      key: KEY_SCOPE_KEY,
      label: "Idempotency Key Scope",
      componentId: "idempotency-store",
      valueLabels: {
        "too-broad": "Too Broad",
        "too-narrow": "Too Narrow",
        "request-scoped": "Request-Scoped",
      },
    },
    {
      key: RETRY_STRATEGY_KEY,
      label: "Worker Retry Strategy",
      componentId: "queue-worker",
      valueLabels: { aggressive: "Aggressive", backoff: "Backoff" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency",
      componentId: "queue-worker",
    },
    {
      key: STORE_UNAVAILABLE_BEHAVIOR_KEY,
      label: "Store-Unavailable Behavior",
      componentId: "queue-worker",
      valueLabels: { "fail-open": "Fail Open", "fail-closed": "Fail Closed" },
    },
  ],
  components: [
    { id: "request-source", label: "Request Source" },
    { id: "service-a", label: "Service A" },
    { id: "queue-worker", label: "Queue / Worker" },
    { id: "idempotency-store", label: "Idempotency Store" },
    { id: "external-side-effect", label: "External Side Effect" },
  ],
};
