import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "health-check-service": "healthy",
  "consumer-group": "healthy",
  "kafka-topic": "healthy",
  "downstream-processor": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "health-check-service": "healthy",
  "consumer-group": "degraded",
  "kafka-topic": "healthy",
  "downstream-processor": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "degraded",
  "health-check-service": "degraded",
  "consumer-group": "critical",
  "kafka-topic": "healthy",
  "downstream-processor": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "health-check-service": "healthy",
  "consumer-group": "healthy",
  "kafka-topic": "healthy",
  "downstream-processor": "healthy",
};

/**
 * Authored rule table for Consumer Rebalance Storm, ordered
 * most-specific-first. Distinct from kafka-consumer-lag (aggregate
 * backpressure) and kafka-partition-skew (per-partition hot-key
 * bottleneck): here the problem is REBALANCE FREQUENCY/CHURN itself — the
 * group spends more time rebalancing than consuming, even though every
 * individual consumer is healthy. Encodes a harmful trap (shortening the
 * session timeout makes the group MORE trigger-happy about declaring
 * consumers dead during the very deploy jitter that's already causing
 * churn), a clean recovery path (static group membership — consumers that
 * restart quickly rejoin their prior assignment without a full
 * rebalance), a partial path (static membership alone, deploy strategy
 * still one-at-a-time), a smaller partial improvement (deploy strategy
 * alone), a health-check-flapping escalation, a baseline-critical
 * default, and a healthy fallback.
 */
export const rebalanceRules: Rule[] = [
  // ── Harmful: shortening the session timeout while a one-at-a-time
  // rolling deploy is active — the coordinator now declares consumers
  // dead on even shorter jitter, triggering MORE rebalances, not fewer.
  // Scoped to staticGroupMembershipEnabled=false: static membership
  // structurally eliminates rebalances from routine restarts regardless
  // of timeout, so it must take precedence over this trap, not the
  // other way around.
  {
    id: "short-timeout-harmful",
    when: {
      triggerEquals: { deployRollingOut: true },
      controlEquals: {
        [DEPLOY_STRATEGY_KEY]: "rolling-one-at-a-time",
        [STATIC_GROUP_MEMBERSHIP_ENABLED_KEY]: false,
      },
      controlAtMost: { [SESSION_TIMEOUT_MS_KEY]: 6_000 },
    },
    incidentState: "rebalance-storm-worsened",
    values: {
      rebalanceCount: 42,
      groupStableTimeRatio: 18,
      effectiveThroughput: 400,
      consumerLagMessages: 9_200,
      groupStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: static group membership lets a quickly-restarted
  // consumer rejoin its prior partition assignment without triggering a
  // full rebalance at all, regardless of deploy strategy.
  {
    id: "static-membership-non-one-at-a-time-recovery",
    when: {
      triggerEquals: { deployRollingOut: true },
      controlEquals: { [STATIC_GROUP_MEMBERSHIP_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      rebalanceCount: 2,
      groupStableTimeRatio: 97,
      effectiveThroughput: 3_900,
      consumerLagMessages: 150,
      groupStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Health-check-flapping escalation: a second, independent source of
  // restarts compounds rebalance frequency on top of whatever the deploy
  // strategy alone was already causing.
  {
    id: "health-check-flapping-escalation",
    when: {
      triggerEquals: { deployRollingOut: true, healthCheckFlapping: true },
      controlEquals: {
        [DEPLOY_STRATEGY_KEY]: "rolling-one-at-a-time",
        [STATIC_GROUP_MEMBERSHIP_ENABLED_KEY]: false,
      },
    },
    incidentState: "rebalance-storm-worsened",
    values: {
      rebalanceCount: 38,
      groupStableTimeRatio: 22,
      effectiveThroughput: 500,
      consumerLagMessages: 8_600,
      groupStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial improvement: a batched or blue-green deploy strategy alone
  // (static membership still off) triggers far fewer rebalance events per
  // deploy, even without the structural fix. RuleCondition has no "not
  // equals" operator (packages/simulator/src/types.ts), so this is
  // expressed as the complement set — one rule per non-default strategy
  // — rather than a single negated condition.
  {
    id: "batched-deploy-strategy-only",
    when: {
      triggerEquals: { deployRollingOut: true },
      controlEquals: {
        [DEPLOY_STRATEGY_KEY]: "rolling-batched",
        [STATIC_GROUP_MEMBERSHIP_ENABLED_KEY]: false,
      },
    },
    incidentState: "degraded",
    values: {
      rebalanceCount: 9,
      groupStableTimeRatio: 72,
      effectiveThroughput: 2_600,
      consumerLagMessages: 1_800,
      groupStatus: "warning",
    },
    componentHealth: degradedHealth,
  },
  {
    id: "blue-green-deploy-strategy-only",
    when: {
      triggerEquals: { deployRollingOut: true },
      controlEquals: {
        [DEPLOY_STRATEGY_KEY]: "blue-green",
        [STATIC_GROUP_MEMBERSHIP_ENABLED_KEY]: false,
      },
    },
    incidentState: "degraded",
    values: {
      rebalanceCount: 4,
      groupStableTimeRatio: 85,
      effectiveThroughput: 3_200,
      consumerLagMessages: 900,
      groupStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: rolling one-at-a-time deploy, default session
  // timeout, static membership off.
  {
    id: "rebalance-storm-default",
    when: { triggerEquals: { deployRollingOut: true } },
    incidentState: "rebalance-storm",
    values: {
      rebalanceCount: 24,
      groupStableTimeRatio: 35,
      effectiveThroughput: 900,
      consumerLagMessages: 6_500,
      groupStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no deploy in progress.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      rebalanceCount: 0,
      groupStableTimeRatio: 99,
      effectiveThroughput: 4_000,
      consumerLagMessages: 100,
      groupStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
