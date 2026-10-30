import type { ScenarioDefinition } from "./types";
import {
  kafkaConsumerLagSimulation,
  CONSUMER_INSTANCES_KEY,
  MAX_POLL_RECORDS_KEY,
  AUTO_COMMIT_ENABLED_KEY,
} from "./kafka-consumer-lag/definition";
import { kafkaConsumerLagCandidateUI } from "./kafka-consumer-lag/candidate-ui";
import { KAFKA_CONSUMER_LAG_SCORING } from "./kafka-consumer-lag/scoring";

/**
 * Kafka Consumer Lag — one of IncidentRank's 3 free launch scenarios
 * (docs/implementation_plan/phase6.md's Free vs Paid section: "Kafka
 * Consumer Lag → asynchronous/event-driven systems"). A producer
 * throughput spike, followed by a batch of expensive-to-process records,
 * pushes a Kafka consumer group's lag into a critical backlog; the
 * candidate must balance consumer parallelism, poll batch size, and
 * offset-commit safety against cost and data-integrity risk.
 */
export const kafkaConsumerLag: ScenarioDefinition = {
  id: "kafka-consumer-lag",
  slug: "kafka-consumer-lag",
  version: 1,
  name: "Kafka Consumer Lag",
  description:
    "A sudden spike in producer throughput is outpacing your consumer group, and a batch of records now requires an expensive downstream lookup per message. Lag is climbing, processing latency is rising, and messages are starting to land in the dead-letter queue. Diagnose the bottleneck and drain the backlog before downstream consumers fall critically behind.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: true,
  structure: "linear",
  simulation: kafkaConsumerLagSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Backpressure", "Consumer Groups", "Idempotency", "Observability"],
    skills: [
      "Diagnosing consumer lag and backpressure",
      "Tuning consumer parallelism and batch size",
      "Offset-commit safety vs. throughput tradeoffs",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A producer traffic spike and a batch of slow records push a Kafka consumer group into a critical backlog.",
  },
};

export {
  kafkaConsumerLagSimulation,
  kafkaConsumerLagCandidateUI,
  KAFKA_CONSUMER_LAG_SCORING,
  CONSUMER_INSTANCES_KEY,
  MAX_POLL_RECORDS_KEY,
  AUTO_COMMIT_ENABLED_KEY,
};
