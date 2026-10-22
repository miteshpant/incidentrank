import type { ScenarioDefinition } from "./types";
import {
  kafkaPartitionSkewSimulation,
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  CONSUMER_INSTANCES_KEY,
} from "./kafka-partition-skew/definition";
import { kafkaPartitionSkewCandidateUI } from "./kafka-partition-skew/candidate-ui";
import { KAFKA_PARTITION_SKEW_SCORING } from "./kafka-partition-skew/scoring";

/**
 * Kafka Partition Skew — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * single large tenant's traffic has concentrated on one Kafka partition.
 * Aggregate consumer-group capacity looks fine — most consumers are
 * barely busy — but the one partition that tenant's messages land on is
 * falling critically behind, because Kafka assigns at most one consumer
 * per partition. The candidate must recognize that scaling consumer
 * count further does nothing for this specific bottleneck; the fix is
 * spreading the hot key across more partitions.
 */
export const kafkaPartitionSkew: ScenarioDefinition = {
  id: "kafka-partition-skew",
  slug: "kafka-partition-skew",
  version: 1,
  name: "Kafka Partition Skew",
  description:
    "A single large tenant's traffic has spiked, and its messages are concentrated on one Kafka partition. Aggregate consumer-group utilization still looks moderate — most consumers are nearly idle — but the one partition that tenant's messages land on is falling critically behind, because only one consumer can ever read from a given partition at a time. Diagnose why the backlog keeps growing despite healthy-looking aggregate metrics, and restore throughput before downstream processing falls critically behind.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  simulation: kafkaPartitionSkewSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Partitioning", "Hot Key", "Scaling", "Observability"],
    skills: [
      "Diagnosing per-partition hot-key bottlenecks",
      "Partition key design and salting strategies",
      "Recognizing when scaling consumers does not help",
      "Reading aggregate vs. per-partition metrics correctly",
    ],
    shortDescription:
      "A hot tenant key concentrates traffic on one Kafka partition, which falls behind even though aggregate consumer capacity looks fine.",
  },
};

export {
  kafkaPartitionSkewSimulation,
  kafkaPartitionSkewCandidateUI,
  KAFKA_PARTITION_SKEW_SCORING,
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  CONSUMER_INSTANCES_KEY,
};
