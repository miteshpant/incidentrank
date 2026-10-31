import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DEPLOY_STRATEGY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  REPLICA_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "deploy-controller": "healthy",
  "orders-api": "healthy",
  "load-balancer": "healthy",
  "order-events-queue": "healthy",
};

const droppingHealth: Record<string, ComponentHealth> = {
  "deploy-controller": "degraded",
  "orders-api": "critical",
  "load-balancer": "degraded",
  "order-events-queue": "degraded",
};

const slowerDeployHealthyHealth: Record<string, ComponentHealth> = {
  "deploy-controller": "degraded",
  "orders-api": "healthy",
  "load-balancer": "healthy",
  "order-events-queue": "healthy",
};

/**
 * Authored rule table for the rolling-deploy graceful-shutdown incident.
 * The real root cause: the shutdown hook on each pod never waits for
 * in-flight requests to finish before the process is killed, so every
 * rolling deploy drops a steady trickle of requests — not a capacity
 * problem, a lifecycle/drain-timing bug. Replica count (the plausible
 * but inferior remediation) never touches this, because every pod
 * individually fails to drain regardless of how many pods exist.
 *
 * Branching structure (per this scenario's assignment): the candidate
 * has two independently-correct remediation paths with different
 * tradeoffs, each captured as its own distinct `diagnosisPath` value
 * (used only for narrative/debugging specificity and golden-path
 * identification):
 *   - "investigated-then-drain-timeout-fix" / "guessed-drain-timeout-fix":
 *     raise the per-pod drain/grace timeout so in-flight requests finish
 *     before termination. Deploys get a few seconds slower per pod, cost
 *     is unaffected, drops stop.
 *   - "investigated-then-deploy-strategy-fix" / "guessed-deploy-strategy-fix":
 *     switch from "rolling" to "surge" or "blue-green" so old pods are
 *     never killed until new ones are already serving. Deploys take
 *     meaningfully longer and briefly cost more (extra capacity during
 *     rollout), but drops stop just the same, achieved a structurally
 *     different way.
 *   - "scaled-replicas-only": the inferior path — more pods, same
 *     per-pod shutdown bug, drops continue at the same rate, and
 *     monthly cost goes up for nothing.
 *
 * `investigationQuality` is a SEPARATE, coarser field scoring.ts actually
 * reads via `finalStringEquals` — "correlated" for EITHER investigated
 * branch (the two correct branches are equally good diagnoses; the
 * dataIntegrity scoring dimension rewards whether the candidate
 * correlated the evidence before acting, not which of the two valid
 * tradeoffs they picked), "guessed" for either fix applied without full
 * investigation, "inferior"/"partial" for the two weaker remediations,
 * and "not-attempted" otherwise. Keeping this distinct from the more
 * specific `diagnosisPath` is deliberate: collapsing two meaningfully
 * different branches into one scoring-measure value would otherwise
 * require the generic `finalStringEquals` measure to know about multiple
 * acceptable values, which it does not support by design (see
 * AuthoredStringStateMeasure's doc comment) — so this scenario adds the
 * coarser field itself rather than asking the shared scorer for a new
 * measure shape.
 *
 * Note: the engine matches rules against a CURRENT snapshot of
 * triggers/controlValues every tick (packages/simulator/src/tick.ts) —
 * both fields capture WHAT the candidate correlated by the time they
 * applied a fix, not strict temporal ordering, exactly like the
 * reference incident's own rule table.
 */
export const shutdownDropRules: Rule[] = [
  // ── Correct fix A: raised the drain timeout enough (>=15s) to let
  // in-flight requests finish, having correlated all three investigation
  // signals first.
  {
    id: "investigated-then-drain-timeout-fix",
    when: {
      triggerEquals: { deployInProgress: true },
      controlEquals: {
        [INSPECT_SHUTDOWN_HOOK_LOGS_KEY]: true,
        [INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY]: true,
        [INSPECT_DEPLOY_HISTORY_KEY]: true,
      },
      controlAtLeast: { [DRAIN_TIMEOUT_SECONDS_KEY]: 15 },
    },
    incidentState: "recovering",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 110,
      orderEventsLagMessages: 6,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 13,
      diagnosisPath: "investigated-then-drain-timeout-fix",
      investigationQuality: "correlated",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix A, applied without investigating first (guessed the
  // drain timeout was the issue, or raised it after inspecting only one
  // signal). The outage still resolves, but investigation-quality
  // scoring penalizes it.
  {
    id: "guessed-drain-timeout-fix",
    when: {
      triggerEquals: { deployInProgress: true },
      controlAtLeast: { [DRAIN_TIMEOUT_SECONDS_KEY]: 15 },
    },
    incidentState: "recovering",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 110,
      orderEventsLagMessages: 6,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 13,
      diagnosisPath: "guessed-drain-timeout-fix",
      investigationQuality: "guessed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix B: switched deploy strategy to surge or blue-green,
  // having correlated all three investigation signals first. Deploys are
  // visibly slower (deployDurationSeconds roughly doubles) and briefly
  // cost more, but drops stop — a legitimately different tradeoff from
  // fix A.
  {
    id: "investigated-then-deploy-strategy-fix",
    when: {
      triggerEquals: { deployInProgress: true },
      controlEquals: {
        [INSPECT_SHUTDOWN_HOOK_LOGS_KEY]: true,
        [INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY]: true,
        [INSPECT_DEPLOY_HISTORY_KEY]: true,
        [DEPLOY_STRATEGY_KEY]: "blue-green",
      },
    },
    incidentState: "recovering",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 240,
      orderEventsLagMessages: 6,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 13,
      diagnosisPath: "investigated-then-deploy-strategy-fix",
      investigationQuality: "correlated",
    },
    componentHealth: slowerDeployHealthyHealth,
  },
  {
    id: "investigated-then-deploy-strategy-fix-surge",
    when: {
      triggerEquals: { deployInProgress: true },
      controlEquals: {
        [INSPECT_SHUTDOWN_HOOK_LOGS_KEY]: true,
        [INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY]: true,
        [INSPECT_DEPLOY_HISTORY_KEY]: true,
        [DEPLOY_STRATEGY_KEY]: "surge",
      },
    },
    incidentState: "recovering",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 190,
      orderEventsLagMessages: 6,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 13,
      diagnosisPath: "investigated-then-deploy-strategy-fix",
      investigationQuality: "correlated",
    },
    componentHealth: slowerDeployHealthyHealth,
  },

  // ── Correct fix B, applied without investigating first.
  {
    id: "guessed-deploy-strategy-fix",
    when: {
      triggerEquals: { deployInProgress: true },
      controlEquals: { [DEPLOY_STRATEGY_KEY]: "blue-green" },
    },
    incidentState: "recovering",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 240,
      orderEventsLagMessages: 6,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 13,
      diagnosisPath: "guessed-deploy-strategy-fix",
      investigationQuality: "guessed",
    },
    componentHealth: slowerDeployHealthyHealth,
  },
  {
    id: "guessed-deploy-strategy-fix-surge",
    when: {
      triggerEquals: { deployInProgress: true },
      controlEquals: { [DEPLOY_STRATEGY_KEY]: "surge" },
    },
    incidentState: "recovering",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 190,
      orderEventsLagMessages: 6,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 13,
      diagnosisPath: "guessed-deploy-strategy-fix",
      investigationQuality: "guessed",
    },
    componentHealth: slowerDeployHealthyHealth,
  },

  // ── Inferior path: scaled replica count up instead of fixing the
  // shutdown/drain behavior or the deploy strategy. Every pod still
  // fails to drain on termination, so the drop rate per deploy is
  // unchanged — only infrastructure cost goes up.
  {
    id: "scaled-replicas-only",
    when: {
      triggerEquals: { deployInProgress: true },
      controlAtLeast: { [REPLICA_COUNT_KEY]: 6 },
      controlAtMost: { [DRAIN_TIMEOUT_SECONDS_KEY]: 5 },
      controlEquals: { [DEPLOY_STRATEGY_KEY]: "rolling" },
    },
    incidentState: "degraded",
    values: {
      droppedRequestsPerDeploy: 340,
      checkoutErrorRate: 4.8,
      deployDurationSeconds: 95,
      orderEventsLagMessages: 210,
      podTerminationGraceExceededCount: 38,
      cpuThrottlePercent: 14,
      diagnosisPath: "scaled-replicas-only",
      investigationQuality: "inferior",
    },
    componentHealth: droppingHealth,
  },

  // ── Partial relief: drain timeout raised, but not enough (5s instead
  // of the 15s actually required to drain the slowest in-flight order
  // requests under this load).
  {
    id: "partial-drain-timeout-increase",
    when: {
      triggerEquals: { deployInProgress: true },
      controlEquals: { [DRAIN_TIMEOUT_SECONDS_KEY]: 5 },
    },
    incidentState: "degraded",
    values: {
      droppedRequestsPerDeploy: 95,
      checkoutErrorRate: 1.6,
      deployDurationSeconds: 100,
      orderEventsLagMessages: 70,
      podTerminationGraceExceededCount: 12,
      cpuThrottlePercent: 13,
      diagnosisPath: "partial-drain-timeout-increase",
      investigationQuality: "partial",
    },
    componentHealth: droppingHealth,
  },

  // ── Baseline critical: deploy in progress, no mitigation applied yet.
  {
    id: "deploy-drop-baseline",
    when: { triggerEquals: { deployInProgress: true } },
    incidentState: "dropping",
    values: {
      droppedRequestsPerDeploy: 340,
      checkoutErrorRate: 4.8,
      deployDurationSeconds: 90,
      orderEventsLagMessages: 210,
      podTerminationGraceExceededCount: 38,
      cpuThrottlePercent: 14,
      diagnosisPath: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: droppingHealth,
  },

  // ── Default/fallback: before the deploy begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      droppedRequestsPerDeploy: 0,
      checkoutErrorRate: 0.1,
      deployDurationSeconds: 90,
      orderEventsLagMessages: 5,
      podTerminationGraceExceededCount: 0,
      cpuThrottlePercent: 12,
      diagnosisPath: "not-attempted",
      investigationQuality: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
