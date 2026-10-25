import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DESTINATION_ISOLATION_ENABLED_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

export const webhookDeliveryStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "webhookBacklog", label: "Webhook Backlog", sourceStateKey: "webhookBacklog", format: "number" },
    { key: "retryVolumePerMinute", label: "Retry Volume / min", sourceStateKey: "retryVolumePerMinute", format: "number" },
    { key: "affectedDestinationFailureRate", label: "Affected Destination Failure Rate", sourceStateKey: "affectedDestinationFailureRate", format: "percentage" },
    { key: "healthyDestinationDeliveryLatencyMs", label: "Healthy Destination Delivery Latency", sourceStateKey: "healthyDestinationDeliveryLatencyMs", format: "duration" },
    { key: "affectedDestinationDeliveryLatencyMs", label: "Affected Destination Delivery Latency", sourceStateKey: "affectedDestinationDeliveryLatencyMs", format: "duration" },
    { key: "dispatcherWorkerUtilization", label: "Dispatcher Worker Utilization", sourceStateKey: "dispatcherWorkerUtilization", format: "percentage" },
    { key: "dlqDepth", label: "Dead-Letter Queue Depth", sourceStateKey: "dlqDepth", format: "number" },
    { key: "dispatcherStatus", label: "Dispatcher Status", sourceStateKey: "dispatcherStatus", format: "status" },
  ],
  controls: [
    {
      key: DESTINATION_ISOLATION_ENABLED_KEY,
      label: "Destination Isolation",
      componentId: "webhook-dispatcher",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: MAX_RETRY_ATTEMPTS_KEY,
      label: "Max Retry Attempts",
      componentId: "webhook-dispatcher",
    },
    {
      key: RETRY_BACKOFF_KEY,
      label: "Retry Backoff",
      componentId: "webhook-dispatcher",
      valueLabels: { none: "None", fixed: "Fixed Delay", exponential: "Exponential" },
    },
    {
      key: DISPATCHER_CONCURRENCY_KEY,
      label: "Dispatcher Concurrency",
      componentId: "webhook-dispatcher",
    },
    {
      key: WORKER_COUNT_KEY,
      label: "Worker Count",
      componentId: "webhook-dispatcher",
    },
    {
      key: DLQ_ESCALATION_THRESHOLD_KEY,
      label: "DLQ Escalation Threshold",
      componentId: "webhook-dispatcher",
    },
  ],
  components: [
    { id: "event-source", label: "Event Source" },
    { id: "webhook-dispatcher", label: "Webhook Dispatcher" },
    { id: "affected-destinations", label: "Affected Customer Endpoints" },
    { id: "healthy-destinations", label: "Healthy Customer Endpoints" },
  ],
};
