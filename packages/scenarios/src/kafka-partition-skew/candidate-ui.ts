import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONSUMER_INSTANCES_KEY,
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
} from "./controls";

export const kafkaPartitionSkewCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "hotPartitionLagMessages", label: "Hot Partition Lag", sourceStateKey: "hotPartitionLagMessages", format: "number" },
    { key: "aggregateConsumerUtilization", label: "Aggregate Consumer Utilization", sourceStateKey: "aggregateConsumerUtilization", format: "percentage" },
    { key: "hotPartitionLatencyMs", label: "Hot Partition Latency", sourceStateKey: "hotPartitionLatencyMs", format: "duration" },
    { key: "idleConsumerCount", label: "Idle Consumers", sourceStateKey: "idleConsumerCount", format: "number" },
    { key: "partitionStatus", label: "Partition Status", sourceStateKey: "partitionStatus", format: "status" },
  ],
  controls: [
    { key: PARTITION_COUNT_KEY, label: "Partition Count", componentId: "kafka-topic" },
    {
      key: PARTITION_KEY_STRATEGY_KEY,
      label: "Partition Key Strategy",
      componentId: "kafka-topic",
      valueLabels: {
        "tenant-id": "Tenant ID (unsalted)",
        "tenant-id-salted": "Tenant ID (salted)",
        "round-robin": "Round Robin",
      },
    },
    { key: CONSUMER_INSTANCES_KEY, label: "Consumer Instances", componentId: "consumer-group" },
  ],
  components: [
    { id: "producer-service", label: "Producer Service" },
    { id: "kafka-topic", label: "Kafka Topic" },
    { id: "hot-partition", label: "Hot Partition" },
    { id: "consumer-group", label: "Consumer Group" },
    { id: "downstream-processor", label: "Downstream Processor" },
  ],
};
