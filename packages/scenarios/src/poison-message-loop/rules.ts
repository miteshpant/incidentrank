import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONSUMER_CONCURRENCY_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-queue": "healthy",
  "consumer-worker": "healthy",
  "processing-service": "healthy",
  "dead-letter-queue": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-queue": "degraded",
  "consumer-worker": "degraded",
  "processing-service": "healthy",
  "dead-letter-queue": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-queue": "critical",
  "consumer-worker": "critical",
  "processing-service": "degraded",
  "dead-letter-queue": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-queue": "healthy",
  "consumer-worker": "healthy",
  "processing-service": "healthy",
  "dead-letter-queue": "degraded",
};

/**
 * Authored rule table for Poison Message Loop, ordered most-specific-first.
 * Encodes a harmful trap (scaling consumer concurrency while retries
 * stay unbounded and the dead-letter queue stays disabled — more workers
 * just means more workers simultaneously stuck retrying the same poison
 * message), a clean full-recovery path (a bounded retry limit plus the
 * dead-letter queue enabled routes the poison message out after N
 * failures, freeing the healthy backlog behind it), a slow-masking
 * partial (a very high but still-bounded retry limit eventually routes
 * the message out, but only after a long, costly delay), a
 * DLQ-enabled-but-still-unbounded partial (the escape hatch exists but
 * nothing ever reaches it), and a baseline-critical default.
 */
export const poisonMessageRules: Rule[] = [
  // ── Harmful: more consumer workers while retries are unbounded and
  // the DLQ is disabled — every added worker independently picks up and
  // re-fails the same poison message, so the retry loop count climbs
  // faster without ever resolving the head-of-line block.
  {
    id: "scaled-concurrency-unbounded-retries-harmful",
    when: {
      triggerEquals: { poisonMessagePresent: true },
      controlAtLeast: {
        [CONSUMER_CONCURRENCY_KEY]: 8,
        [MAX_RETRY_ATTEMPTS_KEY]: 999_999,
      },
      controlEquals: { [DEAD_LETTER_QUEUE_ENABLED_KEY]: false },
    },
    incidentState: "retry-storm",
    values: {
      queueDepth: 1_400,
      retryLoopCount: 850,
      healthyMessageBacklog: 1_200,
      consumerCpuUtilization: 97,
      queueStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: a tight retry bound plus the dead-letter queue
  // enabled — the poison message routes out after a handful of
  // failures, and the healthy backlog behind it drains immediately.
  // Matches regardless of which of the two valid bounded values (3 or
  // 10) is chosen.
  {
    id: "bounded-retries-with-dlq-recovery",
    when: {
      triggerEquals: { poisonMessagePresent: true },
      controlAtMost: { [MAX_RETRY_ATTEMPTS_KEY]: 10 },
      controlEquals: { [DEAD_LETTER_QUEUE_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      queueDepth: 25,
      retryLoopCount: 10,
      healthyMessageBacklog: 0,
      consumerCpuUtilization: 18,
      queueStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Slow-masking partial, eventually recovered: once the 50-attempt
  // bounded retry limit actually exhausts (see timed-events.ts's
  // highRetryLimitExhausted trigger), the poison message finally routes
  // to the dead-letter queue and the backlog drains — matching this
  // rule's own documented "eventually routes out" intent. Ordered before
  // the still-degraded slow rule below since it additionally requires
  // the exhaustion trigger.
  {
    id: "high-bounded-retries-with-dlq-slow-recovered",
    when: {
      triggerEquals: {
        poisonMessagePresent: true,
        highRetryLimitExhausted: true,
      },
      controlEquals: {
        [MAX_RETRY_ATTEMPTS_KEY]: 50,
        [DEAD_LETTER_QUEUE_ENABLED_KEY]: true,
      },
    },
    incidentState: "recovering-slow",
    values: {
      queueDepth: 30,
      retryLoopCount: 50,
      healthyMessageBacklog: 15,
      consumerCpuUtilization: 22,
      queueStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Slow-masking partial, still in progress: a much higher but still-
  // bounded retry limit, DLQ enabled — the poison message is still
  // burning through its 50 attempts (see the recovered variant above for
  // once it finally exhausts), so the backlog has grown substantially
  // but has not drained yet.
  {
    id: "high-bounded-retries-with-dlq-slow",
    when: {
      triggerEquals: { poisonMessagePresent: true },
      controlEquals: {
        [MAX_RETRY_ATTEMPTS_KEY]: 50,
        [DEAD_LETTER_QUEUE_ENABLED_KEY]: true,
      },
    },
    incidentState: "degraded",
    values: {
      queueDepth: 420,
      retryLoopCount: 50,
      healthyMessageBacklog: 380,
      consumerCpuUtilization: 70,
      queueStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial: the escape hatch is enabled, but retries are still
  // unbounded, so nothing ever actually reaches the dead-letter queue —
  // the backlog keeps growing, just slightly slower than the full
  // baseline (DLQ routing logic adds a small amount of overhead/delay
  // even while never triggering).
  {
    id: "dlq-enabled-but-unbounded-retries",
    when: {
      triggerEquals: { poisonMessagePresent: true },
      controlEquals: { [DEAD_LETTER_QUEUE_ENABLED_KEY]: true },
    },
    incidentState: "lagging-dlq-unused",
    values: {
      queueDepth: 1_100,
      retryLoopCount: 600,
      healthyMessageBacklog: 950,
      consumerCpuUtilization: 90,
      queueStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: unbounded retries, dead-letter queue disabled,
  // default consumer concurrency.
  {
    id: "poison-loop-critical-default",
    when: { triggerEquals: { poisonMessagePresent: true } },
    incidentState: "poison-looping",
    values: {
      queueDepth: 1_200,
      retryLoopCount: 700,
      healthyMessageBacklog: 1_000,
      consumerCpuUtilization: 92,
      queueStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no poison message present.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      queueDepth: 20,
      retryLoopCount: 0,
      healthyMessageBacklog: 0,
      consumerCpuUtilization: 15,
      queueStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
