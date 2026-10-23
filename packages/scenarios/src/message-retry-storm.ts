import type { ScenarioDefinition } from "./types";
import {
  messageRetryStormSimulation,
  RETRY_COUNT_KEY,
  BACKOFF_STRATEGY_KEY,
  WORKER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
  DLQ_THRESHOLD_KEY,
  CIRCUIT_BREAKER_KEY,
} from "./message-retry-storm/definition";
import { messageRetryStormCandidateUI } from "./message-retry-storm/candidate-ui";
import { MESSAGE_RETRY_STORM_SCORING } from "./message-retry-storm/scoring";

/**
 * Message Retry Storm — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 26, Messaging &
 * Streaming). A downstream dependency the asynchronous worker pool calls
 * becomes partially unhealthy — an increasing share of its requests fail
 * or time out. Because the pipeline is asynchronous (producer -> broker ->
 * workers -> dependency), no single customer-facing request fails in real
 * time the way a synchronous checkout call would; instead, every failed
 * worker attempt becomes another queued retry. With no retry bound and no
 * dead-letter escape hatch, retries compound faster than the dependency
 * can drain them, and the broker-visible backlog grows without limit. The
 * candidate must recognize that the durable fix bounds retry amplification
 * at the source (a retry ceiling, a dead-letter route for exhausted
 * messages, and/or stopping new calls to an already-failing dependency),
 * not add more workers to pull from a queue whose real bottleneck is the
 * dependency's own reduced capacity.
 */
export const messageRetryStorm: ScenarioDefinition = {
  id: "message-retry-storm",
  slug: "message-retry-storm",
  version: 1,
  name: "Message Retry Storm",
  description:
    "A downstream dependency your worker pool depends on has become partially unhealthy — a rising share of its requests are failing or timing out. Messages that fail to process re-enter the queue for redelivery, and every added worker pulls independently from the same broker. Diagnose why queue depth and retry volume keep climbing even though no single customer-facing request is failing outright, and bring the backlog back under control before it grows unrecoverably large. The downstream dependency's own operators have confirmed it is degraded, not fully down — some requests still succeed.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  simulation: messageRetryStormSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Queues", "Retries", "Backpressure", "Dead Letter Queue", "Circuit Breaker"],
    skills: [
      "Diagnosing retry amplification in an asynchronous queue",
      "Distinguishing queue-health incidents from synchronous request failure",
      "Retry bound, backoff, and dead-letter queue design",
      "Recognizing when added worker capacity doesn't fix the problem",
    ],
    shortDescription:
      "A degraded downstream dependency triggers retry amplification that grows an async queue's backlog without bound.",
  },
};

export {
  messageRetryStormSimulation,
  messageRetryStormCandidateUI,
  MESSAGE_RETRY_STORM_SCORING,
  RETRY_COUNT_KEY,
  BACKOFF_STRATEGY_KEY,
  WORKER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
  DLQ_THRESHOLD_KEY,
  CIRCUIT_BREAKER_KEY,
};
