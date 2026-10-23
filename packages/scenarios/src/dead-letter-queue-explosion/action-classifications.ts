import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONSUMER_INSTANCE_COUNT_KEY,
  DLQ_ACTION_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  REPLAY_PAUSED_KEY,
  RETRY_DELAY_MS_KEY,
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
    controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Fixed the root cause",
      explanation:
        "Restoring parser/schema compatibility meant newly arriving events stopped failing to parse at all, so the dead-letter queue stopped growing. Nothing about the already-queued backlog was touched by this change alone — it addresses future events, not the ones already stuck.",
    },
  },
  {
    id: "acr_2",
    controlKey: DLQ_ACTION_KEY,
    valueEquals: "discard",
    outcome: "harmful",
    feedback: {
      title: "Traded data loss for a clean-looking dashboard",
      explanation:
        "Discarding the dead-letter queue made every operational metric read healthy immediately — queue depth, lag, and error rate all dropped to zero. But the events sitting in the DLQ were, for the most part, genuinely recoverable once the schema issue was fixed. Discarding them destroyed that recoverability permanently; there is no way to get those events back within this incident, no matter what happens afterward.",
    },
  },
  {
    id: "acr_3",
    controlKey: REPLAY_FAILURE_FILTER_KEY,
    valueEquals: "schemaOnly",
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Filtered replay to the recoverable failure class",
      explanation:
        "Restricting replay to events that failed specifically because of the schema issue meant the reprocessor only ever resubmitted events that were actually safe to reprocess, rather than blindly replaying everything in the DLQ regardless of why it landed there.",
    },
  },
  {
    id: "acr_4",
    controlKey: REPLAY_FAILURE_FILTER_KEY,
    valueEquals: "all",
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "harmful",
    feedback: {
      title: "Replayed everything, filtered nothing",
      explanation:
        "Replaying the entire DLQ without filtering by failure class meant events were resubmitted regardless of whether reprocessing them was actually safe, raising the chance that an event whose main-processing side effect hadn't fully settled got processed again concurrently with the reprocessor's own replay.",
    },
  },
  {
    id: "acr_5",
    controlKey: RETRY_DELAY_MS_KEY,
    valueAtLeast: 1_000,
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Paced replay to avoid racing main processing",
      explanation:
        "Increasing the delay between replay batches gave main processing's own retry/acknowledgement cycle time to settle before the reprocessor resubmitted the same events, reducing the chance of the same event being processed concurrently from two paths at once.",
    },
  },
  {
    id: "acr_6",
    controlKey: RETRY_DELAY_MS_KEY,
    valueAtMost: 250,
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "harmful",
    feedback: {
      title: "Replayed too fast to be safe",
      explanation:
        "A short delay between replay batches let the reprocessor race ahead of main processing's own in-flight handling for the same events, raising the chance that an event gets processed twice before the first attempt has fully settled.",
    },
  },
  {
    id: "acr_7",
    controlKey: REPLAY_PAUSED_KEY,
    valueEquals: true,
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "neutral",
    feedback: {
      title: "Paused replay to stop the bleeding",
      explanation:
        "Pausing the reprocessor immediately stopped any further duplicate-processing risk and replay-driven load on main processing. It is a genuinely safe stabilizing move, but it does nothing to drain the existing backlog or fix why new events keep failing — the DLQ either stops growing (if the parser is also fixed) or keeps filling untouched behind the pause.",
    },
  },
  {
    id: "acr_8",
    controlKey: CONSUMER_INSTANCE_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { schemaIssueActive: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that was failing, not fixing",
      explanation:
        "Adding consumer instances while the parser was still broken just meant more instances independently hitting the same parse failure. The DLQ filled faster rather than slower, since the fleet-wide rate of failing events scales with instance count when the root cause is untouched.",
    },
  },
];
