import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONSUMER_CONCURRENCY_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
} from "./controls";

export const poisonMessageLoopCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "queueDepth", label: "Queue Depth", sourceStateKey: "queueDepth", format: "number" },
    { key: "retryLoopCount", label: "Retry Loop Count", sourceStateKey: "retryLoopCount", format: "number" },
    { key: "healthyMessageBacklog", label: "Healthy Message Backlog", sourceStateKey: "healthyMessageBacklog", format: "number" },
    { key: "consumerCpuUtilization", label: "Consumer CPU", sourceStateKey: "consumerCpuUtilization", format: "percentage" },
    { key: "queueStatus", label: "Queue Status", sourceStateKey: "queueStatus", format: "status" },
  ],
  controls: [
    {
      key: MAX_RETRY_ATTEMPTS_KEY,
      label: "Max Retry Attempts",
      componentId: "consumer-worker",
      valueLabels: { "3": "3", "10": "10", "50": "50", "999999": "Unlimited" },
    },
    {
      key: DEAD_LETTER_QUEUE_ENABLED_KEY,
      label: "Dead Letter Queue",
      componentId: "dead-letter-queue",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: CONSUMER_CONCURRENCY_KEY,
      label: "Consumer Concurrency",
      componentId: "consumer-worker",
    },
  ],
  components: [
    { id: "producer-service", label: "Producer Service" },
    { id: "message-queue", label: "Message Queue" },
    { id: "consumer-worker", label: "Consumer Worker" },
    { id: "processing-service", label: "Processing Service" },
    { id: "dead-letter-queue", label: "Dead Letter Queue" },
  ],
};
