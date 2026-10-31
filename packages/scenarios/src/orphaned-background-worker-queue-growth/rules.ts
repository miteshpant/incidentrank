import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  INSPECT_WORKER_LOGS_KEY,
  INSPECT_DEPLOY_DIFF_KEY,
  INSPECT_QUEUE_DEPTH_KEY,
  ROLLBACK_WORKER_DEPLOY_KEY,
  RESTART_WORKER_PODS_KEY,
  WORKER_CONCURRENCY_KEY,
  PAUSE_PRODUCERS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "job-queue": "healthy",
  "worker-pool": "healthy",
  "notification-api": "healthy",
};

// Workers are fully dead (zero consumers), queue growing unbounded,
// downstream starved. Producer stays healthy throughout — it is never
// the cause, and never part of either fix track.
const deadWorkersHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "job-queue": "critical",
  "worker-pool": "critical",
  "notification-api": "critical",
};

// Deploy fixed, workers consuming again, but the accumulated backlog is
// still being drained at normal (low) concurrency — queue is recovering
// but slowly, downstream is still stale.
const drainingSlowlyHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "job-queue": "degraded",
  "worker-pool": "healthy",
  "notification-api": "degraded",
};

/**
 * Authored rule table for the Orphaned Background Worker Queue Growth
 * parallel incident. Root cause: a bad environment variable shipped in
 * the latest worker deploy makes every worker pod crash-loop on startup
 * — not slow, not poisoned by one bad message (contrast
 * dead-letter-queue-explosion), not thrashing through repeated rebalance
 * cycles (contrast consumer-rebalance-storm) — consumers are completely,
 * uniformly DEAD. Producers never stop publishing, so queue depth grows
 * without bound the entire time zero consumers are attached.
 *
 * This is genuinely "parallel", not just flavor text: there are two
 * independent problems that must both be solved, and solving either one
 * alone leaves a real, measurably bad outcome —
 *   Track A (fix the deploy): rolling back/fixing the bad env var is the
 *     only thing that brings activeConsumerCount off zero. Restarting
 *     the existing pods WITHOUT fixing the env var just crash-loops them
 *     again (plausible-but-inferior path — "restarted-workers-only").
 *   Track B (drain the backlog): once workers are healthy again, the
 *     backlog accumulated while they were dead does not disappear on its
 *     own — it drains at whatever throughput the worker pool is
 *     configured for. Raising worker concurrency is what actually clears
 *     the backlog quickly; leaving concurrency at its default drains it
 *     far more slowly ("fixed-deploy-default-concurrency").
 * Doing Track A without Track B, or Track B without Track A, both leave
 * the incident unresolved — this is the authored lesson the rule table
 * and scoring both encode. The `diagnosisPath` string captures which
 * combination of tracks the candidate actually completed by the time the
 * fix lands, read generically by scoring.ts's finalStringEquals measure,
 * and by the post-incident narrative via roleInIncident-tagged metrics
 * (candidate-ui.ts) — never a bespoke mechanism.
 *
 * Note: the engine matches rules against a CURRENT snapshot of
 * triggers/controlValues every tick (packages/simulator/src/tick.ts) —
 * there is no "control X was set before control Y" primitive, so
 * `diagnosisPath` captures WHICH combination of tracks + investigation
 * the candidate completed, not strict temporal ordering.
 */
export const orphanedWorkerRules: Rule[] = [
  // ── Best path: investigated all three signal sources, rolled back the
  // bad deploy (Track A), AND raised worker concurrency enough to drain
  // the backlog quickly (Track B). Both tracks genuinely completed.
  {
    id: "investigated-both-tracks-fixed",
    when: {
      triggerEquals: { workersDead: true },
      controlEquals: {
        [INSPECT_WORKER_LOGS_KEY]: true,
        [INSPECT_DEPLOY_DIFF_KEY]: true,
        [INSPECT_QUEUE_DEPTH_KEY]: true,
        [ROLLBACK_WORKER_DEPLOY_KEY]: true,
      },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 16 },
    },
    incidentState: "recovering",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 60,
      activeConsumerCount: 12,
      workerCrashLoopRestartCount: 3,
      jobAgeP95Seconds: 6,
      notificationDeliveryDelaySeconds: 4,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "investigated-both-tracks-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Both tracks completed, but without the investigation — the fix is
  // the fix, the outage still resolves quickly, but the candidate never
  // demonstrated they understood the deploy-vs-backlog distinction.
  {
    id: "both-tracks-fixed-no-investigation",
    when: {
      triggerEquals: { workersDead: true },
      controlEquals: { [ROLLBACK_WORKER_DEPLOY_KEY]: true },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 16 },
    },
    incidentState: "recovering",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 60,
      activeConsumerCount: 12,
      workerCrashLoopRestartCount: 3,
      jobAgeP95Seconds: 6,
      notificationDeliveryDelaySeconds: 4,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "both-tracks-fixed-no-investigation",
    },
    componentHealth: healthyHealth,
  },

  // ── Track A only: deploy rolled back, workers healthy again, but
  // concurrency left at its default (4) — the backlog drains, just very
  // slowly. Queue and downstream delay stay materially elevated.
  {
    id: "fixed-deploy-default-concurrency",
    when: {
      triggerEquals: { workersDead: true },
      controlEquals: { [ROLLBACK_WORKER_DEPLOY_KEY]: true },
      controlAtMost: { [WORKER_CONCURRENCY_KEY]: 4 },
    },
    incidentState: "degraded",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 4_800,
      activeConsumerCount: 12,
      workerCrashLoopRestartCount: 3,
      jobAgeP95Seconds: 240,
      notificationDeliveryDelaySeconds: 180,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "fixed-deploy-default-concurrency",
    },
    componentHealth: drainingSlowlyHealth,
  },

  // ── Track A only, partial concurrency raise (8, not enough): still
  // draining faster than default but nowhere near cleared.
  {
    id: "fixed-deploy-partial-concurrency",
    when: {
      triggerEquals: { workersDead: true },
      controlEquals: { [ROLLBACK_WORKER_DEPLOY_KEY]: true },
      controlAtMost: { [WORKER_CONCURRENCY_KEY]: 8 },
    },
    incidentState: "degraded",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 2_200,
      activeConsumerCount: 12,
      workerCrashLoopRestartCount: 3,
      jobAgeP95Seconds: 95,
      notificationDeliveryDelaySeconds: 70,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "fixed-deploy-partial-concurrency",
    },
    componentHealth: drainingSlowlyHealth,
  },

  // ── Track B only: concurrency raised, but the deploy was never rolled
  // back — there are still zero healthy consumers attached, so raising
  // concurrency on a crash-looping pool does nothing. Queue keeps
  // growing exactly as in the baseline-broken state.
  {
    id: "raised-concurrency-only",
    when: {
      triggerEquals: { workersDead: true },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 16 },
      controlEquals: { [ROLLBACK_WORKER_DEPLOY_KEY]: false },
    },
    incidentState: "critical",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 9_600,
      activeConsumerCount: 0,
      workerCrashLoopRestartCount: 58,
      jobAgeP95Seconds: 480,
      notificationDeliveryDelaySeconds: 420,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "raised-concurrency-only",
    },
    componentHealth: deadWorkersHealth,
  },

  // ── Plausible-but-inferior path A: restarting the existing worker pods
  // without fixing the bad env var. The new pods boot with the exact
  // same broken configuration and crash-loop again almost immediately —
  // the crash-loop restart count climbs, but activeConsumerCount never
  // recovers.
  {
    id: "restarted-workers-only",
    when: {
      triggerEquals: { workersDead: true },
      controlEquals: { [RESTART_WORKER_PODS_KEY]: true, [ROLLBACK_WORKER_DEPLOY_KEY]: false },
    },
    incidentState: "critical",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 9_800,
      activeConsumerCount: 0,
      workerCrashLoopRestartCount: 64,
      jobAgeP95Seconds: 500,
      notificationDeliveryDelaySeconds: 440,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "restarted-workers-only",
    },
    componentHealth: deadWorkersHealth,
  },

  // ── Plausible-but-inferior path B: pausing producers. This stops the
  // backlog from growing any further, but it does not drain a single
  // already-enqueued job, and it does nothing about the dead-consumer
  // root cause either. Queue depth plateaus instead of climbing, which
  // can look like "progress" without actually being a fix.
  {
    id: "paused-producers-only",
    when: {
      triggerEquals: { workersDead: true },
      controlEquals: { [PAUSE_PRODUCERS_KEY]: true, [ROLLBACK_WORKER_DEPLOY_KEY]: false },
    },
    incidentState: "critical",
    values: {
      producerPublishRatePerSecond: 0,
      queueDepth: 9_200,
      activeConsumerCount: 0,
      workerCrashLoopRestartCount: 50,
      jobAgeP95Seconds: 520,
      notificationDeliveryDelaySeconds: 460,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "paused-producers-only",
    },
    componentHealth: deadWorkersHealth,
  },

  // ── Baseline critical: deploy broke the workers, no mitigation applied
  // yet. Producer is deliberately unaffected — the misleading-healthy
  // signal the candidate must notice is NOT where the problem lives.
  {
    id: "workers-dead-baseline",
    when: { triggerEquals: { workersDead: true } },
    incidentState: "critical",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 10_400,
      activeConsumerCount: 0,
      workerCrashLoopRestartCount: 46,
      jobAgeP95Seconds: 460,
      notificationDeliveryDelaySeconds: 400,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 9,
      diagnosisPath: "not-attempted",
    },
    componentHealth: deadWorkersHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      producerPublishRatePerSecond: 40,
      queueDepth: 500,
      activeConsumerCount: 12,
      workerCrashLoopRestartCount: 0,
      jobAgeP95Seconds: 8,
      notificationDeliveryDelaySeconds: 5,
      producerErrorRate: 0.1,
      monitoringDashboardRefreshLagSeconds: 2,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
