import type { ScenarioDefinition } from "./types";
import {
  deadLetterQueueExplosionSimulation,
  REPLAY_PAUSED_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  RETRY_DELAY_MS_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  CONSUMER_INSTANCE_COUNT_KEY,
  DLQ_ACTION_KEY,
} from "./dead-letter-queue-explosion/definition";
import { deadLetterQueueExplosionCandidateUI } from "./dead-letter-queue-explosion/candidate-ui";
import { DEAD_LETTER_QUEUE_EXPLOSION_SCORING } from "./dead-letter-queue-explosion/scoring";

/**
 * Dead-Letter Queue Explosion — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 27). A schema/content
 * change in an upstream producer is causing a large share of events to
 * fail parsing. They are landing in the dead-letter queue, and a
 * reprocessor has started replaying DLQ contents back into the consumer
 * concurrently with live traffic. The candidate must restore
 * parser/schema compatibility so new events stop failing, and drain the
 * existing backlog deliberately — filtered to the recoverable failure
 * class, paced to avoid racing main processing's own retries — rather
 * than reaching for the DLQ's discard action, which makes every
 * operational metric look perfectly healthy while permanently
 * destroying events that were otherwise recoverable.
 */
export const deadLetterQueueExplosion: ScenarioDefinition = {
  id: "dead-letter-queue-explosion",
  slug: "dead-letter-queue-explosion",
  version: 1,
  name: "Dead-Letter Queue Explosion",
  description:
    "A schema/content change is causing a large share of incoming events to fail parsing and land in the dead-letter queue, and a reprocessor has begun replaying DLQ contents back into the consumer at the same time. Events in the DLQ represent real customer activity (orders, updates, notifications) that must eventually be processed exactly once — side effects must never be applied twice, and any event that is dropped is gone for good. Diagnose why events are failing, stop the bleeding, and bring the backlog back to a safe, durable state.",
  difficulty: "senior",
  estimatedMinutes: 18,
  isFree: false,
  structure: "linear",
  simulation: deadLetterQueueExplosionSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Dead-Letter Queue", "Replay", "Data Integrity", "Schema Compatibility"],
    skills: [
      "Diagnosing schema/content-driven consumer failures",
      "Distinguishing a real fix from an operationally-clean-looking data-loss shortcut",
      "Balancing replay throughput against duplicate-processing risk",
      "Recognizing when scaling capacity cannot compensate for a broken parser",
    ],
    shortDescription:
      "Events are failing parsing and piling into the DLQ while a reprocessor replays them concurrently — and discarding the backlog looks like a fix but is really irreversible data loss.",
  },
};

export {
  deadLetterQueueExplosionSimulation,
  deadLetterQueueExplosionCandidateUI,
  DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
  REPLAY_PAUSED_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  RETRY_DELAY_MS_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  CONSUMER_INSTANCE_COUNT_KEY,
  DLQ_ACTION_KEY,
};
