import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per Phase 6B's mandatory post-incident-feedback
 * requirement (docs/implementation_plan/phase6b.md section 13). Ids are
 * stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: PARTITION_KEY_STRATEGY_KEY,
    valueEquals: "account-id-keyed",
    whenTriggerEquals: { routingChangeActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Restored the per-account ordering guarantee at the source",
      explanation:
        "Re-keying partitions by account id means every account's events land on the same partition again, so the single consumer that owns it processes them strictly in produce order. Ordering violations stop occurring rather than being caught after the fact. The tradeoff is throughput: round-robin's even load spread across partitions is gone, so aggregate event throughput drops compared to what round-robin could sustain.",
    },
  },
  {
    id: "acr_2",
    controlKey: REORDER_BUFFER_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { routingChangeActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Added a buffer to resequence events before they're applied",
      explanation:
        "Holding recently-arrived events briefly and releasing them in sequence-number order absorbs cross-partition skew for an account whose events spread across partitions, whether that skew is already being addressed by re-keying or is still an active risk under round-robin. The cost is added per-event processing latency while events wait in the buffer.",
    },
  },
  {
    id: "acr_3",
    controlKey: SEQUENCE_VALIDATION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { routingChangeActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled a check against writing stale state",
      explanation:
        "Validating an event's sequence number against the materialized state's currently recorded sequence before writing stops any individual write from moving an account's state backward. On its own this only prevents regression at the point of write — it does not, by itself, guarantee that a rejected or held event is ever successfully reconciled; that depends on what else is in place to resequence and retry it.",
    },
  },
  {
    id: "acr_4",
    controlKey: DELAYED_PROCESSING_TOLERANCE_KEY,
    valueAtMost: 500,
    whenTriggerEquals: { routingChangeActive: true },
    outcome: "neutral",
    feedback: {
      title: "Left the reconciliation window too short to catch up",
      explanation:
        "A short delayed-processing tolerance window gives little time for a held, out-of-sequence event to be resequenced before the consumer has to decide what to do with it. Under continued cross-partition skew, the reconciliation path drains the backlog more slowly than new violations arrive, so the unreconciled count keeps growing even though throughput and consumer lag look unaffected.",
    },
  },
  {
    id: "acr_5",
    controlKey: CONSUMER_PARALLELISM_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { routingChangeActive: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled consumers while cross-partition skew was still active",
      explanation:
        "Adding consumers under round-robin keying means more independently-scheduled processes are now racing to write the same accounts' materialized state from different partitions. Throughput went up, but so did the rate and severity of ordering violations — the added parallelism amplified the very race condition causing the incident rather than relieving pressure.",
    },
  },
  {
    id: "acr_6",
    controlKey: CONSUMER_PARALLELISM_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { routingChangeActive: false },
    outcome: "neutral",
    feedback: {
      title: "Added consumer capacity ahead of any ordering risk",
      explanation:
        "Raising consumer parallelism before the routing change has taken effect has no interaction with cross-partition ordering yet — it neither helps nor hurts the eventual incident on its own.",
    },
  },
];
