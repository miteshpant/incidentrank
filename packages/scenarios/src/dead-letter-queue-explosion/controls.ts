import type { ControlDefinition } from "@incidentrank/simulator";

/** Pauses the reprocessor entirely. Stops new duplicate-processing risk
 * from accumulating immediately, but does nothing about the DLQ backlog
 * itself or the root schema/content issue still feeding new events into
 * it — a stabilizing move, not a fix. */
export const REPLAY_PAUSED_KEY = "replayPaused";

/** Restricts replay to only the failure class that is genuinely
 * recoverable (the schema/content issue), leaving any other failure
 * class parked in the DLQ rather than replayed blindly. Replaying "all"
 * failure classes together is what lets a few processing-error events
 * get replayed into main processing a second time while the real
 * schema issue is still unresolved, since the reprocessor cannot tell
 * which failures are safe to retry. */
export const REPLAY_FAILURE_FILTER_KEY = "replayFailureFilter";

/** Delay the reprocessor waits between replay batches. A short delay
 * lets the reprocessor race ahead of main processing's own in-flight
 * retries for the same events, raising the chance the same event is
 * processed twice concurrently. A longer delay paces replay so main
 * processing's own retry/ack cycle for a given event has time to
 * settle first. */
export const RETRY_DELAY_MS_KEY = "retryDelayMs";

/** The real root-cause fix: updates the consumer's parser to accept the
 * new event schema/content variant that has been landing in the DLQ,
 * so newly arriving events stop failing and entering the DLQ at all. */
export const PARSER_SCHEMA_COMPAT_MODE_KEY = "parserSchemaCompatMode";

/** Horizontal scaling of the consumer fleet. More consumer capacity can
 * help drain main-queue lag once the schema issue is fixed, but scaling
 * consumers alone does nothing about events already failing to parse —
 * more consumers just means more instances hitting the same parse
 * failure and feeding the DLQ faster. */
export const CONSUMER_INSTANCE_COUNT_KEY = "consumerInstanceCount";

/** The irreversible trap: permanently discards every event currently
 * sitting in the DLQ. DLQ depth and every other operational metric
 * immediately look perfectly healthy, but any event that was genuinely
 * recoverable (the vast majority, since the root cause is a fixable
 * schema/content issue) is gone for good — see rules.ts's
 * dlq-discarded-irreversible-data-loss and this scenario's dataLossState
 * field. */
export const DLQ_ACTION_KEY = "dlqAction";

export const controls: ControlDefinition[] = [
  {
    key: REPLAY_PAUSED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REPLAY_FAILURE_FILTER_KEY,
    allowedValues: ["all", "schemaOnly"],
    initialValue: "all",
  },
  {
    key: RETRY_DELAY_MS_KEY,
    allowedValues: [250, 1_000, 5_000],
    initialValue: 250,
  },
  {
    key: PARSER_SCHEMA_COMPAT_MODE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CONSUMER_INSTANCE_COUNT_KEY,
    allowedValues: [2, 4, 8, 16],
    initialValue: 2,
  },
  {
    key: DLQ_ACTION_KEY,
    allowedValues: ["none", "discard"],
    initialValue: "none",
  },
];
