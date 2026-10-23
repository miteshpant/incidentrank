import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKOFF_STRATEGY_KEY,
  CIRCUIT_BREAKER_KEY,
  DLQ_THRESHOLD_KEY,
  RETRY_COUNT_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-broker": "healthy",
  "worker-pool": "healthy",
  "downstream-dependency": "healthy",
  "dead-letter-queue": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-broker": "degraded",
  "worker-pool": "degraded",
  "downstream-dependency": "degraded",
  "dead-letter-queue": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-broker": "critical",
  "worker-pool": "critical",
  "downstream-dependency": "critical",
  "dead-letter-queue": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-broker": "healthy",
  "worker-pool": "healthy",
  "downstream-dependency": "degraded",
  "dead-letter-queue": "degraded",
};

/**
 * Authored rule table for Message Retry Storm, ordered most-specific-first.
 *
 * Core teaching point (distinct from Payment Retry Storm's synchronous
 * checkout-traffic problem): this is an ASYNCHRONOUS queue. The downstream
 * dependency degrading doesn't directly fail a live customer request — it
 * fails a worker's attempt to process a queued message, which the broker's
 * at-least-once redelivery then retries. With retries unbounded and no
 * dead-letter escape hatch, every failed attempt becomes another retry,
 * and every added worker becomes another independent source of retry
 * traffic — so queue depth and retry rate compound rather than converge,
 * even though no single customer-facing call is "failing" in the
 * synchronous sense. The durable fix is bounding retries and giving
 * exhausted messages somewhere to go (DLQ) and/or stopping new calls to
 * the dependency outright (circuit breaker) — never simply adding more
 * workers to drain a queue whose bottleneck is the dependency itself.
 */
export const messageRetryStormRules: Rule[] = [
  // ── Harmful: worker pool scaled up while retries remain unbounded and
  // the DLQ is disabled. Checked first/most-specific: every additional
  // worker independently pulls and retries messages against a dependency
  // that cannot absorb more load, so retry rate and queue depth climb
  // faster than the single-worker-pool baseline rather than draining it.
  {
    id: "scaled-workers-unbounded-retries-harmful",
    when: {
      triggerEquals: { dependencyDegraded: true },
      controlAtLeast: { [WORKER_COUNT_KEY]: 8, [RETRY_COUNT_KEY]: 999 },
      controlEquals: { [DLQ_THRESHOLD_KEY]: 999_999 },
    },
    incidentState: "retry-storm",
    values: {
      queueDepth: 18_000,
      retryRatePerMinute: 9_000,
      downstreamRequestVolumePerMinute: 9_400,
      workerSuccessRate: 22,
      dependencyErrorRate: 78,
      processingLatencyMs: 6_800,
      queueHealth: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery, path 1: bounded retries plus the DLQ enabled.
  // Messages that keep failing exhaust their bound quickly and route out,
  // so the queue stops accumulating retried copies of the same failing
  // work and drains behind them. Matches either bounded retry value.
  {
    id: "bounded-retries-with-dlq-recovery",
    when: {
      triggerEquals: { dependencyDegraded: true },
      controlAtMost: { [RETRY_COUNT_KEY]: 3, [DLQ_THRESHOLD_KEY]: 10 },
    },
    incidentState: "recovering",
    values: {
      queueDepth: 90,
      retryRatePerMinute: 40,
      downstreamRequestVolumePerMinute: 340,
      workerSuccessRate: 97,
      dependencyErrorRate: 35,
      processingLatencyMs: 280,
      queueHealth: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Good recovery, path 2 (alternate strategy): circuit breaker on
  // with exponential backoff, independent of DLQ configuration. Stopping
  // new calls once the dependency is already failing most requests gives
  // it room to recover and prevents new retries from ever entering the
  // queue in large numbers — a legitimate different route to the same
  // safe outcome, not a lesser one.
  {
    id: "circuit-breaker-backoff-recovery",
    when: {
      triggerEquals: { dependencyDegraded: true },
      controlEquals: { [CIRCUIT_BREAKER_KEY]: "on", [BACKOFF_STRATEGY_KEY]: "exponential" },
    },
    incidentState: "recovering-breaker",
    values: {
      queueDepth: 150,
      retryRatePerMinute: 60,
      downstreamRequestVolumePerMinute: 120,
      workerSuccessRate: 95,
      dependencyErrorRate: 20,
      processingLatencyMs: 310,
      queueHealth: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial: circuit breaker alone (no backoff tuning). Stops the
  // worst of the hammering once it trips, but without spaced-out retries
  // the breaker flaps open/closed as soon as its cooldown elapses, so the
  // queue stabilizes at a materially elevated level rather than draining.
  {
    id: "circuit-breaker-alone-partial",
    when: {
      triggerEquals: { dependencyDegraded: true },
      controlEquals: { [CIRCUIT_BREAKER_KEY]: "on" },
    },
    incidentState: "flapping-breaker",
    values: {
      queueDepth: 2_200,
      retryRatePerMinute: 1_100,
      downstreamRequestVolumePerMinute: 1_300,
      workerSuccessRate: 70,
      dependencyErrorRate: 55,
      processingLatencyMs: 1_900,
      queueHealth: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial: the DLQ escape hatch is enabled, but retries are still
  // effectively unbounded, so almost nothing ever actually reaches the
  // dead-letter threshold before being redelivered again — queue depth
  // keeps growing, just slightly slower than the full unmitigated
  // baseline (dead-letter routing logic adds a little overhead even
  // while rarely triggering).
  {
    id: "dlq-enabled-but-unbounded-retries",
    when: {
      triggerEquals: { dependencyDegraded: true },
      controlAtMost: { [DLQ_THRESHOLD_KEY]: 10 },
      controlAtLeast: { [RETRY_COUNT_KEY]: 999 },
    },
    incidentState: "lagging-dlq-unused",
    values: {
      queueDepth: 7_200,
      retryRatePerMinute: 3_400,
      downstreamRequestVolumePerMinute: 3_600,
      workerSuccessRate: 48,
      dependencyErrorRate: 60,
      processingLatencyMs: 3_200,
      queueHealth: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial: retries bounded but the DLQ is still disabled. Messages
  // stop being retried forever on a single delivery attempt chain, but
  // with nowhere to route a permanently-failing message, the broker's
  // own redelivery logic still recirculates it — backlog growth slows
  // sharply compared to the unbounded baseline but does not reverse.
  {
    id: "bounded-retries-without-dlq-partial",
    when: {
      triggerEquals: { dependencyDegraded: true },
      controlAtMost: { [RETRY_COUNT_KEY]: 3 },
    },
    incidentState: "redelivery-loop",
    values: {
      queueDepth: 4_100,
      retryRatePerMinute: 1_900,
      downstreamRequestVolumePerMinute: 2_000,
      workerSuccessRate: 58,
      dependencyErrorRate: 58,
      processingLatencyMs: 2_400,
      queueHealth: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Second-wave escalation: nothing meaningful was done before the
  // sustained retry pressure pushed the dependency's own error rate
  // higher still (DEPENDENCY_WORSENS_MS). Reachable only from the
  // unmitigated baseline's own trigger combination, continuing the
  // already-visible rising trend rather than introducing a hidden one.
  {
    id: "dependency-worsened-unmitigated",
    when: { triggerEquals: { dependencyDegraded: true, dependencyWorsened: true } },
    incidentState: "retry-storm-escalated",
    values: {
      queueDepth: 26_000,
      retryRatePerMinute: 12_500,
      downstreamRequestVolumePerMinute: 12_800,
      workerSuccessRate: 9,
      dependencyErrorRate: 92,
      processingLatencyMs: 9_500,
      queueHealth: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: dependency degraded, no mitigation applied.
  // Default retry count (10, effectively unbounded relative to the
  // dependency's reduced capacity) and DLQ disabled — every failure
  // redelivers, and redeliveries keep competing with fresh messages for
  // the same degraded dependency capacity.
  {
    id: "retry-storm-critical-default",
    when: { triggerEquals: { dependencyDegraded: true } },
    incidentState: "retry-storm-building",
    values: {
      queueDepth: 5_800,
      retryRatePerMinute: 2_600,
      downstreamRequestVolumePerMinute: 2_800,
      workerSuccessRate: 52,
      dependencyErrorRate: 50,
      processingLatencyMs: 2_600,
      queueHealth: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: dependency healthy, no incident.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      queueDepth: 40,
      retryRatePerMinute: 5,
      downstreamRequestVolumePerMinute: 300,
      workerSuccessRate: 99.8,
      dependencyErrorRate: 0.2,
      processingLatencyMs: 220,
      queueHealth: "normal",
    },
    componentHealth: healthyHealth,
  },
];
