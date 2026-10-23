import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKOFF_STRATEGY_KEY,
  CIRCUIT_BREAKER_KEY,
  DLQ_THRESHOLD_KEY,
  RETRY_COUNT_KEY,
  WORKER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

export const messageRetryStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "queueDepth", label: "Queue Depth", sourceStateKey: "queueDepth", format: "number" },
    {
      key: "retryRatePerMinute",
      label: "Retry Rate / min",
      sourceStateKey: "retryRatePerMinute",
      format: "number",
    },
    {
      key: "downstreamRequestVolumePerMinute",
      label: "Downstream Request Volume / min",
      sourceStateKey: "downstreamRequestVolumePerMinute",
      format: "number",
    },
    {
      key: "workerSuccessRate",
      label: "Worker Success Rate",
      sourceStateKey: "workerSuccessRate",
      format: "percentage",
    },
    {
      key: "dependencyErrorRate",
      label: "Dependency Error Rate",
      sourceStateKey: "dependencyErrorRate",
      format: "percentage",
    },
    {
      key: "processingLatencyMs",
      label: "Processing Latency",
      sourceStateKey: "processingLatencyMs",
      format: "duration",
    },
    { key: "queueHealth", label: "Queue Health", sourceStateKey: "queueHealth", format: "status" },
  ],
  controls: [
    {
      key: RETRY_COUNT_KEY,
      label: "Retry Count",
      componentId: "worker-pool",
      valueLabels: { "1": "1", "3": "3", "10": "10", "999": "Unbounded" },
    },
    {
      key: BACKOFF_STRATEGY_KEY,
      label: "Backoff Strategy",
      componentId: "worker-pool",
      valueLabels: { none: "None", fixed: "Fixed", exponential: "Exponential" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency",
      componentId: "worker-pool",
    },
    {
      key: WORKER_COUNT_KEY,
      label: "Worker Count",
      componentId: "worker-pool",
    },
    {
      key: DLQ_THRESHOLD_KEY,
      label: "DLQ Threshold",
      componentId: "dead-letter-queue",
      valueLabels: { "3": "3", "10": "10", "999999": "Off" },
    },
    {
      key: CIRCUIT_BREAKER_KEY,
      label: "Circuit Breaker",
      componentId: "downstream-dependency",
      valueLabels: { off: "Off", on: "On" },
    },
  ],
  components: [
    { id: "producer-service", label: "Producer Service" },
    { id: "message-broker", label: "Message Broker" },
    { id: "worker-pool", label: "Worker Pool" },
    { id: "downstream-dependency", label: "Downstream Dependency" },
    { id: "dead-letter-queue", label: "Dead Letter Queue" },
  ],
};
