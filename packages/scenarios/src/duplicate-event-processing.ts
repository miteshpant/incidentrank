import type { ScenarioDefinition } from "./types";
import {
  duplicateEventProcessingSimulation,
  ACK_TIMEOUT_MS_KEY,
  CONSUMER_CONCURRENCY_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
  MAX_REDELIVERY_ATTEMPTS_KEY,
} from "./duplicate-event-processing/definition";
import { duplicateEventProcessingCandidateUI } from "./duplicate-event-processing/candidate-ui";
import { DUPLICATE_EVENT_PROCESSING_SCORING } from "./duplicate-event-processing/scoring";

/**
 * Duplicate Event Processing — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 28). Consumer
 * acknowledgements to the broker begin failing intermittently, and
 * unacknowledged messages are redelivered. Throughput and failure-rate
 * metrics can look perfectly healthy while the order and payment side
 * effects attached to those events are quietly being applied more than
 * once. The candidate must recognize that a system which "looks fast and
 * available" is not the same as a system that is safe to hand back.
 */
export const duplicateEventProcessing: ScenarioDefinition = {
  id: "duplicate-event-processing",
  slug: "duplicate-event-processing",
  version: 1,
  name: "Duplicate Event Processing",
  description:
    "Consumer acknowledgements to the broker are failing intermittently, and unacknowledged messages are being redelivered. Order and payment processing must remain idempotent — an order or payment side effect applying more than once for the same underlying event is a critical integrity incident, not a cosmetic one, regardless of how healthy throughput and acknowledgement metrics otherwise look. Diagnose why redelivery is occurring and bring the system to a state that is genuinely safe to hand back, not merely fast.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: duplicateEventProcessingSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Idempotency", "Deduplication", "Correctness", "At-Least-Once Delivery"],
    skills: [
      "Distinguishing availability metrics from correctness guarantees",
      "Recognizing when a mitigation improves throughput without addressing duplication",
      "Reasoning about acknowledgement timing and redelivery amplification",
      "Evaluating idempotent processing and deduplication-window tradeoffs",
    ],
    shortDescription:
      "Acknowledgement failures are causing redelivery, and duplicate order/payment side effects keep accumulating even while throughput looks healthy.",
  },
};

export {
  duplicateEventProcessingSimulation,
  duplicateEventProcessingCandidateUI,
  DUPLICATE_EVENT_PROCESSING_SCORING,
  ACK_TIMEOUT_MS_KEY,
  CONSUMER_CONCURRENCY_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
  MAX_REDELIVERY_ATTEMPTS_KEY,
};
