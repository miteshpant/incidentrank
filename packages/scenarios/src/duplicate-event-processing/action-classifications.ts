import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ACK_TIMEOUT_MS_KEY,
  CONSUMER_CONCURRENCY_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
  MAX_REDELIVERY_ATTEMPTS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: IDEMPOTENT_PROCESSING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { ackFailuresActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled idempotent processing",
      explanation:
        "Checking each event's identity before applying its side effect means a redelivered copy of an already-applied event is recognized and skipped rather than re-applied. This is the only change that stops duplicate orders/payments from accumulating, independent of how often acknowledgements keep failing. On its own it still needs a real window of recent ids to check against — see the deduplication window control.",
    },
  },
  {
    id: "acr_2",
    controlKey: DEDUPLICATION_WINDOW_SECONDS_KEY,
    valueAtLeast: 30,
    whenTriggerEquals: { ackFailuresActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Widened the deduplication window",
      explanation:
        "A nonzero deduplication window gives idempotent processing an actual set of recently-applied event ids to check a redelivered event's identity against. Without idempotent processing enabled, this control alone has nothing to feed — the two controls work together to actually suppress duplicates.",
    },
  },
  {
    id: "acr_3",
    controlKey: CONSUMER_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { ackFailuresActive: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled concurrency while duplicates kept accumulating",
      explanation:
        "Adding consumer processes let more messages — including redelivered duplicates — get picked up and processed concurrently. Consumer throughput looked healthy, even improved, but nothing about this recognizes that a message has already been applied once. Duplicate orders and payments accumulated faster than before, not slower, because more independent consumers were now capable of re-applying the same event.",
    },
  },
  {
    id: "acr_4",
    controlKey: ACK_TIMEOUT_MS_KEY,
    valueAtMost: 1_000,
    whenTriggerEquals: { ackFailuresActive: true },
    outcome: "harmful",
    feedback: {
      title: "Lowered the ack timeout while acknowledgements were already failing",
      explanation:
        "Giving up on an acknowledgement sooner meant more messages were redelivered before their original ack had a genuine chance to land, even for events that would have eventually acknowledged successfully. Redelivery volume and duplicate production both increased relative to leaving the timeout alone — reacting faster amplified the underlying problem instead of containing it.",
    },
  },
  {
    id: "acr_5",
    controlKey: MAX_REDELIVERY_ATTEMPTS_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { ackFailuresActive: true },
    outcome: "neutral",
    feedback: {
      title: "Raised the redelivery ceiling without addressing duplication",
      explanation:
        "Allowing more redelivery attempts before an event is routed to a dead-letter path mainly affects how long an event keeps retrying before giving up — it does not by itself cause or prevent duplicate side effects. Without idempotent processing in place, each additional allowed attempt is simply one more opportunity for the same event to be reapplied if it keeps failing to acknowledge.",
    },
  },
];
