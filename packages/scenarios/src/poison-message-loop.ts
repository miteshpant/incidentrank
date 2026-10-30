import type { ScenarioDefinition } from "./types";
import {
  poisonMessageLoopSimulation,
  MAX_RETRY_ATTEMPTS_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  CONSUMER_CONCURRENCY_KEY,
} from "./poison-message-loop/definition";
import { poisonMessageLoopCandidateUI } from "./poison-message-loop/candidate-ui";
import { POISON_MESSAGE_LOOP_SCORING } from "./poison-message-loop/scoring";

/**
 * Poison Message Loop — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * malformed message from a buggy upstream producer enters the queue and
 * repeatedly fails to process. With no retry bound and no dead-letter
 * routing, the consumer re-delivers and re-fails the same poison message
 * forever, starving every healthy message stuck behind it. The candidate
 * must recognize that the durable fix is a bounded retry limit paired
 * with dead-letter routing, not simply adding more consumer workers to
 * a queue that is blocked on a single unprocessable message.
 */
export const poisonMessageLoop: ScenarioDefinition = {
  id: "poison-message-loop",
  slug: "poison-message-loop",
  version: 1,
  name: "Poison Message Loop",
  description:
    "A malformed message from a buggy upstream producer has entered the queue and is failing to process. Because retries have no bound and the dead-letter queue is disabled, the consumer keeps re-delivering and re-failing the same message, starving every healthy message stuck behind it. Diagnose the head-of-line block and get the backlog flowing again before the queue falls critically behind.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  structure: "linear",
  simulation: poisonMessageLoopSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Queues", "Dead Letter Queue", "Retries", "Reliability", "Idempotency"],
    skills: [
      "Diagnosing head-of-line blocking in message queues",
      "Retry bound and dead-letter queue design",
      "Recognizing when added concurrency doesn't fix the problem",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A malformed message loops forever in retry, blocking every healthy message queued behind it.",
  },
};

export {
  poisonMessageLoopSimulation,
  poisonMessageLoopCandidateUI,
  POISON_MESSAGE_LOOP_SCORING,
  MAX_RETRY_ATTEMPTS_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  CONSUMER_CONCURRENCY_KEY,
};
