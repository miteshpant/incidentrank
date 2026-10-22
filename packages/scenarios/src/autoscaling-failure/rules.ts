import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "autoscaler-controller": "healthy",
  "autoscaling-group": "healthy",
  "backend-service": "healthy",
  database: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "autoscaler-controller": "degraded",
  "autoscaling-group": "degraded",
  "backend-service": "degraded",
  database: "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "load-balancer": "degraded",
  "autoscaler-controller": "critical",
  "autoscaling-group": "critical",
  "backend-service": "critical",
  database: "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "autoscaler-controller": "healthy",
  "autoscaling-group": "healthy",
  "backend-service": "healthy",
  database: "healthy",
};

/**
 * Authored rule table for Autoscaling Failure, ordered most-specific-first.
 * The central lesson: maxInstanceCount is the binding constraint when it's
 * too low — no amount of scaleUpCooldownSeconds/scaleUpThresholdPercent
 * tuning helps if the autoscaler is structurally capped from scaling past
 * it. Encodes a harmful-if-relied-on-alone trap (aggressive threshold/
 * cooldown tuning with the cap still low — reacts faster but hits the
 * same ceiling just as fast), a clean recovery (cap raised adequately,
 * regardless of tuning), two partial paths (cap raised moderately, with
 * and without complementary tuning), an escalation once traffic surges
 * further, a baseline-critical default, and a healthy fallback.
 */
export const autoscalingRules: Rule[] = [
  // ── Harmful if relied on alone: threshold lowered and cooldown
  // shortened — the autoscaler reacts instantly and aggressively — but
  // maxInstanceCount is still at its low default, so it hits the exact
  // same ceiling just as fast. Barely any improvement over baseline
  // despite the tuning effort.
  {
    id: "aggressive-tuning-low-cap-harmful",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlAtMost: {
        [MAX_INSTANCE_COUNT_KEY]: 4,
        [SCALE_UP_THRESHOLD_PERCENT_KEY]: 70,
        [SCALE_UP_COOLDOWN_SECONDS_KEY]: 60,
      },
    },
    incidentState: "capped",
    values: {
      currentInstanceCount: 4,
      requestQueueDepth: 370,
      cpuUtilizationPercent: 96,
      errorRate: 14,
      capacityStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: cap raised to an adequate level — regardless of
  // threshold/cooldown tuning, since the actual constraint is removed.
  {
    id: "adequate-cap-recovery",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlAtLeast: { [MAX_INSTANCE_COUNT_KEY]: 16 },
    },
    incidentState: "recovering",
    values: {
      currentInstanceCount: 18,
      requestQueueDepth: 10,
      cpuUtilizationPercent: 45,
      errorRate: 0.5,
      capacityStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Smaller partial improvement: cap raised moderately AND tuning
  // improved — meaningfully better than tuning-alone, but the cap is
  // still somewhat constraining under this traffic level.
  {
    id: "moderate-cap-with-tuning",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: { [MAX_INSTANCE_COUNT_KEY]: 8 },
      controlAtMost: {
        [SCALE_UP_THRESHOLD_PERCENT_KEY]: 70,
        [SCALE_UP_COOLDOWN_SECONDS_KEY]: 60,
      },
    },
    incidentState: "degraded",
    values: {
      currentInstanceCount: 8,
      requestQueueDepth: 50,
      cpuUtilizationPercent: 60,
      errorRate: 2,
      capacityStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: cap raised moderately, tuning left at
  // defaults — instances scale to the new (still-limited) cap, but
  // slowly and conservatively.
  {
    id: "moderate-cap-only",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: { [MAX_INSTANCE_COUNT_KEY]: 8 },
    },
    incidentState: "degraded",
    values: {
      currentInstanceCount: 8,
      requestQueueDepth: 120,
      cpuUtilizationPercent: 75,
      errorRate: 4,
      capacityStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Escalation: traffic surges even further while still unmitigated —
  // an already-inadequate cap is now even more clearly the constraint.
  {
    id: "further-surge-escalation",
    when: { triggerEquals: { trafficSpiking: true, furtherSurge: true } },
    incidentState: "capped",
    values: {
      currentInstanceCount: 4,
      requestQueueDepth: 520,
      cpuUtilizationPercent: 99,
      errorRate: 22,
      capacityStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: traffic spike active, no mitigation, default
  // low cap.
  {
    id: "autoscaling-critical-default",
    when: { triggerEquals: { trafficSpiking: true } },
    incidentState: "overwhelmed",
    values: {
      currentInstanceCount: 4,
      requestQueueDepth: 400,
      cpuUtilizationPercent: 98,
      errorRate: 15,
      capacityStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no traffic spike active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      currentInstanceCount: 4,
      requestQueueDepth: 0,
      cpuUtilizationPercent: 35,
      errorRate: 0.1,
      capacityStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
