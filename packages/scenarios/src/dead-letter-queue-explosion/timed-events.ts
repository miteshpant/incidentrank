import type { TimedEvent } from "@incidentrank/simulator";

const SCHEMA_ISSUE_MS = 30_000;
// Second wave: the reprocessor's own backlog of already-queued replay
// batches catches up to the still-growing DLQ, pushing replay
// concurrency higher against main processing. This is never a surprise
// — duplicateProcessingRiskScore and replayThroughputPerMin have already
// been visibly climbing since SCHEMA_ISSUE_MS for any candidate who has
// not paused/filtered replay, so a candidate watching those two metrics
// has every reason to expect replay pressure to keep intensifying.
const REPLAY_BACKLOG_CATCHUP_MS = SCHEMA_ISSUE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "schema-issue-begins",
    atMs: SCHEMA_ISSUE_MS,
    type: "TRIGGER_SET",
    message:
      "A schema/content change in an upstream producer is causing a large share of events to fail parsing. They are landing in the dead-letter queue, and the reprocessor has started replaying DLQ contents back into the consumer concurrently with live traffic.",
    setTriggers: { schemaIssueActive: true },
  },
  {
    id: "replay-backlog-catchup",
    atMs: REPLAY_BACKLOG_CATCHUP_MS,
    type: "TRIGGER_SET",
    message:
      "The reprocessor's replay backlog has caught up to the still-growing DLQ. Replay concurrency against main processing is intensifying.",
    setTriggers: { schemaIssueActive: true, replayBacklogCatchup: true },
  },
];

export { SCHEMA_ISSUE_MS, REPLAY_BACKLOG_CATCHUP_MS };
