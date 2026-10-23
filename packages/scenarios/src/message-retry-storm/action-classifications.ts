import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKOFF_STRATEGY_KEY,
  CIRCUIT_BREAKER_KEY,
  DLQ_THRESHOLD_KEY,
  RETRY_COUNT_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping. Never used to decide resolution/failure. `feedback`
 * (Phase 6.1/6B) is purely a post-incident educational explanation — never
 * read by simulate()/tick.ts, never affects scoring — revealed only after
 * a signed-in PRACTICE attempt is terminal (see
 * apps/web/src/lib/server/action-feedback.ts). `id` gives each rule a
 * stable, neutral identity so a later review pass can be traced back to
 * exactly which rule matched, without the id itself leaking the authored
 * logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: RETRY_COUNT_KEY,
    valueAtMost: 3,
    whenTriggerEquals: { dependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Bounded the retry count",
      explanation:
        "Capping retries meant a message that kept failing against the degraded dependency stopped being redelivered indefinitely, instead of permanently occupying worker and broker capacity on an attempt that was never going to succeed.",
    },
  },
  {
    id: "acr_2",
    controlKey: RETRY_COUNT_KEY,
    valueAtLeast: 999,
    whenTriggerEquals: { dependencyDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Left retries effectively unbounded",
      explanation:
        "With no retry ceiling, every failed call against the degraded dependency was redelivered again, and again — the retry traffic itself became a growing share of the load the dependency had to handle, on top of its original problem.",
    },
  },
  {
    id: "acr_3",
    controlKey: DLQ_THRESHOLD_KEY,
    valueAtMost: 10,
    whenTriggerEquals: { dependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Gave failing messages somewhere to go",
      explanation:
        "Routing messages to the dead-letter queue after a bounded number of failures stopped them from recirculating through the broker forever, freeing capacity for messages that could still succeed.",
    },
  },
  {
    id: "acr_4",
    controlKey: BACKOFF_STRATEGY_KEY,
    valueEquals: "exponential",
    whenTriggerEquals: { dependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Spread retries out over time",
      explanation:
        "Exponential backoff spaced consecutive retry attempts further apart instead of firing them back-to-back, reducing how much instantaneous request volume the degraded dependency received at any one moment.",
    },
  },
  {
    id: "acr_5",
    controlKey: CIRCUIT_BREAKER_KEY,
    valueEquals: "on",
    whenTriggerEquals: { dependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Stopped new calls to a failing dependency",
      explanation:
        "Tripping the circuit breaker short-circuited new requests to the dependency once its failure rate crossed threshold, giving it room to recover instead of continuing to receive traffic it was already failing to serve. On its own, without spacing out the retries that resume once the breaker closes, it can still settle into a flapping pattern rather than a full recovery.",
    },
  },
  {
    id: "acr_6",
    controlKey: WORKER_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { dependencyDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the wrong tier",
      explanation:
        "The bottleneck was the downstream dependency's reduced capacity to handle requests, not a shortage of workers pulling from the broker. Adding more workers added more independent sources of retry traffic against a dependency that could not absorb more load, compounding the backlog instead of draining it.",
    },
  },
];
