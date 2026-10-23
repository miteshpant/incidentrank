import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BATCH_SIZE_KEY,
  CONSUMER_COUNT_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

export const eventProcessingBackpressureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "kafkaLagMessages", label: "Kafka Consumer Lag", sourceStateKey: "kafkaLagMessages", format: "number" },
    { key: "processingThroughputPerSec", label: "Processing Throughput / sec", sourceStateKey: "processingThroughputPerSec", format: "number" },
    { key: "eventFreshnessSeconds", label: "Event Freshness", sourceStateKey: "eventFreshnessSeconds", format: "duration" },
    { key: "dbConnectionUtilization", label: "DB Connection Utilization", sourceStateKey: "dbConnectionUtilization", format: "percentage" },
    { key: "externalApiErrorRate", label: "External API Error Rate", sourceStateKey: "externalApiErrorRate", format: "percentage" },
    { key: "kafkaStatus", label: "Kafka Status", sourceStateKey: "kafkaStatus", format: "status" },
  ],
  controls: [
    {
      key: PRODUCER_THROTTLE_ENABLED_KEY,
      label: "Producer Throttle",
      componentId: "event-producers",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: WORKER_CONCURRENCY_KEY,
      label: "Worker Concurrency",
      componentId: "processing-layer",
    },
    {
      key: CONSUMER_COUNT_KEY,
      label: "Consumer Count",
      componentId: "kafka",
    },
    {
      key: BATCH_SIZE_KEY,
      label: "Batch Size",
      componentId: "processing-layer",
    },
    {
      key: EXTERNAL_API_CALL_CONCURRENCY_KEY,
      label: "External API Call Concurrency",
      componentId: "external-api",
    },
    {
      key: PRIORITY_ROUTING_ENABLED_KEY,
      label: "Priority Routing",
      componentId: "processing-layer",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
  ],
  components: [
    { id: "event-producers", label: "Event Producers" },
    { id: "kafka", label: "Kafka" },
    { id: "processing-layer", label: "Processing Layer" },
    { id: "database", label: "Database" },
    { id: "external-api", label: "External API" },
  ],
};
