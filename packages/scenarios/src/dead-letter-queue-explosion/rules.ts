import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONSUMER_INSTANCE_COUNT_KEY,
  DLQ_ACTION_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  REPLAY_PAUSED_KEY,
  RETRY_DELAY_MS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  events: "healthy",
  consumer: "healthy",
  "main-processing": "healthy",
  dlq: "healthy",
  reprocessor: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  events: "healthy",
  consumer: "degraded",
  "main-processing": "degraded",
  dlq: "degraded",
  reprocessor: "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  events: "healthy",
  consumer: "critical",
  "main-processing": "critical",
  dlq: "critical",
  reprocessor: "critical",
};

// The discarded-DLQ snapshot: every operational signal reads healthy
// (nothing left to process, nothing left to replay), but the dead-letter
// queue itself — the only place the lost events could ever have been
// recovered from — no longer exists.
const dlqDiscardedHealth: Record<string, ComponentHealth> = {
  events: "healthy",
  consumer: "healthy",
  "main-processing": "healthy",
  dlq: "critical",
  reprocessor: "healthy",
};

/**
 * Authored rule table for Dead-Letter Queue Explosion, ordered
 * most-specific first. A schema/content change makes a large share of
 * events fail parsing; they land in the DLQ while the reprocessor
 * replays DLQ contents back into the consumer concurrently with live
 * traffic. The durable fix is restoring parser/schema compatibility so
 * new events stop failing, combined with disciplined replay (filtered
 * by failure class, paced with retry delay) to drain the existing
 * backlog without duplicating side effects. Discarding the DLQ is the
 * scenario's central trap: it zeroes every operational metric
 * immediately but permanently destroys events that were otherwise
 * recoverable — see dlq-discarded-irreversible-data-loss below and
 * dataLossState/eventsPermanentlyLost in metrics.ts.
 */
export const deadLetterQueueExplosionRules: Rule[] = [
  // ── THE TRAP: the DLQ is discarded. Checked first (after the schema
  // trigger match further below would otherwise apply) so it wins over
  // every other control combination the instant the candidate chooses
  // it — discarding takes priority over any other mitigation in effect,
  // exactly as a real purge would. Every operational metric reads
  // clean: depth 0, no growth, no lag, no errors, no duplicate risk.
  // dataLossState flips to "eventsPurged" and eventsPermanentlyLost
  // becomes nonzero — this is the one authored state in this scenario
  // that successCondition/acceptableCondition must never accept, no
  // matter how healthy everything else looks (see revenue-and-cost.ts).
  {
    id: "dlq-discarded-irreversible-data-loss",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlEquals: { [DLQ_ACTION_KEY]: "discard" },
    },
    incidentState: "dlq-discarded",
    values: {
      dlqDepth: 0,
      dlqGrowthRatePerMin: 0,
      mainQueueLagMessages: 15,
      processingErrorRate: 2,
      replayThroughputPerMin: 0,
      duplicateProcessingRiskScore: 0,
      consumerStatus: "normal",
      dataLossState: "eventsPurged",
      eventsPermanentlyLost: 4_800,
    },
    componentHealth: dlqDiscardedHealth,
  },

  // ── Optimal recovery: parser/schema compatibility restored. New
  // events stop failing and entering the DLQ at all (growth rate drops
  // to zero), and disciplined replay (filtered to the schema failure
  // class, with a non-trivial retry delay) safely drains the existing
  // backlog without racing main processing's own retries — duplicate
  // risk stays at zero throughout. This is the first trigger-gated rule
  // after the discard trap, so it wins over every other control
  // combination once the parser fix is live and replay is disciplined.
  {
    id: "parser-fixed-disciplined-replay-recovery",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlEquals: {
        [PARSER_SCHEMA_COMPAT_MODE_KEY]: true,
        [REPLAY_FAILURE_FILTER_KEY]: "schemaOnly",
        [DLQ_ACTION_KEY]: "none",
      },
      controlAtLeast: { [RETRY_DELAY_MS_KEY]: 1_000 },
    },
    incidentState: "recovered-fixed",
    values: {
      dlqDepth: 5,
      dlqGrowthRatePerMin: 0,
      mainQueueLagMessages: 20,
      processingErrorRate: 1,
      replayThroughputPerMin: 180,
      duplicateProcessingRiskScore: 2,
      consumerStatus: "normal",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable: parser fixed and replay paused. New events stop
  // failing, but the existing backlog is left parked in the DLQ rather
  // than drained — a genuinely safe handback (no new failures, no
  // duplicate risk, nothing lost) that simply defers backlog cleanup
  // rather than completing it.
  {
    id: "parser-fixed-replay-paused-safe-handback",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlEquals: {
        [PARSER_SCHEMA_COMPAT_MODE_KEY]: true,
        [REPLAY_PAUSED_KEY]: true,
        [DLQ_ACTION_KEY]: "none",
      },
    },
    incidentState: "recovered-replay-paused",
    values: {
      dlqDepth: 640,
      dlqGrowthRatePerMin: 0,
      mainQueueLagMessages: 25,
      processingErrorRate: 1,
      replayThroughputPerMin: 0,
      duplicateProcessingRiskScore: 0,
      consumerStatus: "normal",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful: parser fixed, but replay is left unfiltered ("all")
  // racing against main processing with a short retry delay. New
  // events stop failing, yet the reprocessor keeps replaying the
  // existing backlog — including events whose main-processing side
  // effects may not have fully settled yet — at high concurrency and
  // tight timing, so duplicate-processing risk climbs rather than
  // clearing. This is the unfiltered-replay trap distinct from
  // discarding: nothing is lost, but correctness is still at risk.
  {
    id: "unfiltered-fast-replay-duplicate-risk",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlEquals: {
        [PARSER_SCHEMA_COMPAT_MODE_KEY]: true,
        [REPLAY_FAILURE_FILTER_KEY]: "all",
        [REPLAY_PAUSED_KEY]: false,
        [DLQ_ACTION_KEY]: "none",
      },
      controlAtMost: { [RETRY_DELAY_MS_KEY]: 250 },
    },
    incidentState: "unfiltered-replay-risk",
    values: {
      dlqDepth: 410,
      dlqGrowthRatePerMin: 0,
      mainQueueLagMessages: 70,
      processingErrorRate: 3,
      replayThroughputPerMin: 640,
      duplicateProcessingRiskScore: 78,
      consumerStatus: "warning",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful: consumers scaled up while the parser is still broken.
  // More consumer instances just means more instances hitting the same
  // parse failure — the DLQ fills faster, not slower, and main queue
  // lag still climbs because the fleet-wide error rate scales with
  // instance count.
  {
    id: "scaling-consumers-worsens-dlq-fill-rate",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlAtLeast: { [CONSUMER_INSTANCE_COUNT_KEY]: 8 },
      controlEquals: {
        [PARSER_SCHEMA_COMPAT_MODE_KEY]: false,
        [DLQ_ACTION_KEY]: "none",
      },
    },
    incidentState: "scaled-consumers-worsened",
    values: {
      dlqDepth: 5_200,
      dlqGrowthRatePerMin: 420,
      mainQueueLagMessages: 980,
      processingErrorRate: 42,
      replayThroughputPerMin: 310,
      duplicateProcessingRiskScore: 65,
      consumerStatus: "critical",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: criticalHealth,
  },

  // ── Partial relief: replay paused while the parser is still broken.
  // Stops duplicate-processing risk from accumulating further and halts
  // new replay-driven load on main processing, but new events are still
  // failing and piling into the DLQ — the root cause is untouched.
  {
    id: "replay-paused-parser-still-broken-partial",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlEquals: {
        [REPLAY_PAUSED_KEY]: true,
        [PARSER_SCHEMA_COMPAT_MODE_KEY]: false,
        [DLQ_ACTION_KEY]: "none",
      },
    },
    incidentState: "replay-paused-backlog-growing",
    values: {
      dlqDepth: 1_900,
      dlqGrowthRatePerMin: 260,
      mainQueueLagMessages: 90,
      processingErrorRate: 38,
      replayThroughputPerMin: 0,
      duplicateProcessingRiskScore: 5,
      consumerStatus: "warning",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline: the reprocessor's replay backlog has
  // caught up to the still-growing DLQ, intensifying replay concurrency
  // against main processing on top of the already-elevated error rate.
  // Only reachable once no mitigation above has matched.
  {
    id: "replay-backlog-catchup-baseline",
    when: {
      triggerEquals: { schemaIssueActive: true, replayBacklogCatchup: true },
      controlEquals: { [DLQ_ACTION_KEY]: "none" },
    },
    incidentState: "backlog-catchup",
    values: {
      dlqDepth: 8_100,
      dlqGrowthRatePerMin: 520,
      mainQueueLagMessages: 1_400,
      processingErrorRate: 44,
      replayThroughputPerMin: 890,
      duplicateProcessingRiskScore: 92,
      consumerStatus: "critical",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: schema issue active, candidate has taken no
  // meaningfully mitigating action yet. DLQ is growing, replay is
  // already racing live traffic at default (short) retry delay, and
  // duplicate-processing risk is visibly climbing.
  {
    id: "schema-issue-baseline",
    when: {
      triggerEquals: { schemaIssueActive: true },
      controlEquals: { [DLQ_ACTION_KEY]: "none" },
    },
    incidentState: "dlq-growing",
    values: {
      dlqDepth: 3_400,
      dlqGrowthRatePerMin: 340,
      mainQueueLagMessages: 520,
      processingErrorRate: 40,
      replayThroughputPerMin: 580,
      duplicateProcessingRiskScore: 58,
      consumerStatus: "critical",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      dlqDepth: 20,
      dlqGrowthRatePerMin: 0,
      mainQueueLagMessages: 50,
      processingErrorRate: 1,
      replayThroughputPerMin: 0,
      duplicateProcessingRiskScore: 0,
      consumerStatus: "normal",
      dataLossState: "intact",
      eventsPermanentlyLost: 0,
    },
    componentHealth: healthyHealth,
  },
];
