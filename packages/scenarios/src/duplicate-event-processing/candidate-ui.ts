import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ACK_TIMEOUT_MS_KEY,
  CONSUMER_CONCURRENCY_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
  MAX_REDELIVERY_ATTEMPTS_KEY,
} from "./controls";

export const duplicateEventProcessingCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "consumerThroughputPerSec", label: "Consumer Throughput", sourceStateKey: "consumerThroughputPerSec", format: "number" },
    { key: "ackFailureRatePct", label: "Acknowledgement Failure Rate", sourceStateKey: "ackFailureRatePct", format: "percentage" },
    { key: "redeliveryVolumePerMin", label: "Redelivery Volume / min", sourceStateKey: "redeliveryVolumePerMin", format: "number" },
    { key: "duplicateEventRatePct", label: "Duplicate Event Rate", sourceStateKey: "duplicateEventRatePct", format: "percentage" },
    { key: "duplicateOrderCount", label: "Duplicate Orders", sourceStateKey: "duplicateOrderCount", format: "number" },
    { key: "duplicatePaymentCount", label: "Duplicate Payments", sourceStateKey: "duplicatePaymentCount", format: "number" },
    { key: "brokerStatus", label: "Broker Status", sourceStateKey: "brokerStatus", format: "status" },
  ],
  controls: [
    {
      key: IDEMPOTENT_PROCESSING_ENABLED_KEY,
      label: "Idempotent Processing",
      componentId: "consumers",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: DEDUPLICATION_WINDOW_SECONDS_KEY,
      label: "Deduplication Window (sec)",
      componentId: "consumers",
    },
    {
      key: ACK_TIMEOUT_MS_KEY,
      label: "Ack Timeout (ms)",
      componentId: "broker",
    },
    {
      key: MAX_REDELIVERY_ATTEMPTS_KEY,
      label: "Max Redelivery Attempts",
      componentId: "broker",
    },
    {
      key: CONSUMER_CONCURRENCY_KEY,
      label: "Consumer Concurrency",
      componentId: "consumers",
    },
  ],
  components: [
    { id: "producer", label: "Producer" },
    { id: "broker", label: "Broker" },
    { id: "consumers", label: "Consumers" },
    { id: "side-effects", label: "Payment/Order Side Effects" },
  ],
};
