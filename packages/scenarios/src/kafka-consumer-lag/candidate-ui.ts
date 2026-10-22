import type { CandidateUIDescriptor } from "../candidate-ui";
import { AUTO_COMMIT_ENABLED_KEY, CONSUMER_INSTANCES_KEY, MAX_POLL_RECORDS_KEY } from "./controls";

export const kafkaConsumerLagCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "consumerLagMessages", label: "Consumer Lag", sourceStateKey: "consumerLagMessages", format: "number" },
    { key: "processingLatencyMs", label: "Processing Latency", sourceStateKey: "processingLatencyMs", format: "duration" },
    { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    { key: "deadLetterCount", label: "Dead Letter Count", sourceStateKey: "deadLetterCount", format: "number" },
    { key: "consumerStatus", label: "Consumer Status", sourceStateKey: "consumerStatus", format: "status" },
  ],
  controls: [
    { key: CONSUMER_INSTANCES_KEY, label: "Consumer Instances", componentId: "consumer-group" },
    {
      key: MAX_POLL_RECORDS_KEY,
      label: "Max Poll Records",
      componentId: "consumer-group",
      valueLabels: { "100": "100", "500": "500", "1000": "1,000", "5000": "5,000" },
    },
    {
      key: AUTO_COMMIT_ENABLED_KEY,
      label: "Auto Commit Offsets",
      componentId: "consumer-group",
      valueLabels: { false: "Off (manual commit)", true: "On (auto commit)" },
    },
  ],
  components: [
    { id: "producer-service", label: "Producer Service" },
    { id: "kafka-topic", label: "Kafka Topic" },
    { id: "consumer-group", label: "Consumer Group" },
    { id: "downstream-api", label: "Downstream API" },
    { id: "dead-letter-queue", label: "Dead Letter Queue" },
  ],
};
