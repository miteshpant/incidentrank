import type { ScenarioDefinition } from "./types";
import {
  eventProcessingBackpressureSimulation,
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
  CONSUMER_COUNT_KEY,
  BATCH_SIZE_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
} from "./event-processing-backpressure/definition";
import { eventProcessingBackpressureCandidateUI } from "./event-processing-backpressure/candidate-ui";
import { EVENT_PROCESSING_BACKPRESSURE_SCORING } from "./event-processing-backpressure/scoring";

/**
 * Event Processing Backpressure — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 30). Upstream event
 * producers have surged well past what the processing layer can drain.
 * Kafka consumer lag and event staleness are the first visible symptom.
 * The obvious first move — add Kafka consumers and worker concurrency —
 * genuinely drains the backlog, but each added consumer/worker opens
 * more concurrent database connections and makes more concurrent calls
 * to the external API. Pushed far enough without also managing
 * downstream capacity, the bottleneck does not disappear — it transfers
 * one hop downstream, into the database or the external dependency.
 */
export const eventProcessingBackpressure: ScenarioDefinition = {
  id: "event-processing-backpressure",
  slug: "event-processing-backpressure",
  version: 1,
  name: "Event Processing Backpressure",
  description:
    "Upstream event producers have surged well past the processing layer's normal drain capacity, and Kafka consumer lag is climbing along with how stale events are by the time they're processed. The database connection pool and the external API's call budget are both shared with other production traffic, and the external API enforces its own rate limits — exceeding them degrades the dependency for longer than the surge itself lasts. Diagnose why the backlog is growing and bring ingestion, processing, and both downstream dependencies back into a durable, sustainable balance.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: eventProcessingBackpressureSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Backpressure", "Concurrency", "Capacity", "Rate Limiting"],
    skills: [
      "Diagnosing producer/consumer throughput mismatches",
      "Recognizing when a mitigation transfers pressure to a different subsystem",
      "Balancing ingestion, processing concurrency, and downstream dependency capacity",
      "Evaluating priority-based tradeoffs under sustained backpressure",
    ],
    shortDescription:
      "Producers are outpacing the processing layer, and scaling consumers to drain Kafka can quietly overload the database or the external API instead.",
  },
};

export {
  eventProcessingBackpressureSimulation,
  eventProcessingBackpressureCandidateUI,
  EVENT_PROCESSING_BACKPRESSURE_SCORING,
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
  CONSUMER_COUNT_KEY,
  BATCH_SIZE_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
};
