import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "app-service": "healthy",
  database: "healthy",
  "previous-version": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "degraded",
  "app-service": "degraded",
  database: "healthy",
  "previous-version": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "degraded",
  "app-service": "critical",
  database: "degraded",
  "previous-version": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "app-service": "healthy",
  database: "healthy",
  "previous-version": "healthy",
};

/**
 * Authored rule table for Deployment Regression, ordered
 * most-specific-first. Encodes a harmful-if-relied-on-alone trap
 * (enabling debug logging "to investigate" while leaving full traffic on
 * the regressed version — purely diagnostic, changes nothing about live
 * impact), a clean recovery path (rollback or zeroing canary traffic), a
 * partial-traffic-reduction path, a memory-growth escalation once the
 * regression is left unmitigated long enough, a baseline-critical
 * default, and a healthy fallback.
 */
export const regressionRules: Rule[] = [
  // ── Harmful if relied on alone: debug logging enabled, but traffic
  // routing is untouched — errorRate/latency stay exactly as bad as
  // doing nothing, since nothing about what users actually hit changed.
  {
    id: "debug-logging-without-rollback-harmful",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: {
        [DEBUG_LOGGING_ENABLED_KEY]: true,
        [ROLLBACK_TO_PREVIOUS_VERSION_KEY]: false,
      },
      controlAtLeast: { [CANARY_TRAFFIC_PERCENT_KEY]: 100 },
    },
    incidentState: "regressing",
    values: {
      errorRate: 9.5,
      latencyP99Ms: 2_400,
      memoryUsageMb: 850,
      affectedRequestCount: 4_200,
      deployStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: rolled back to the last-known-good version — the
  // regressed code stops receiving traffic entirely.
  {
    id: "rollback-recovery",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: { [ROLLBACK_TO_PREVIOUS_VERSION_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      errorRate: 0.2,
      latencyP99Ms: 140,
      memoryUsageMb: 410,
      affectedRequestCount: 0,
      deployStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Good recovery (equivalent): canary traffic driven to 0 — the
  // regressed version still exists but receives no live traffic.
  {
    id: "canary-zeroed-recovery",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: { [CANARY_TRAFFIC_PERCENT_KEY]: 0 },
    },
    incidentState: "recovering",
    values: {
      errorRate: 0.2,
      latencyP99Ms: 140,
      memoryUsageMb: 410,
      affectedRequestCount: 0,
      deployStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial improvement: canary traffic reduced but not zeroed — less
  // of the user base hits the regression, meaningfully better than
  // baseline, but not resolved.
  {
    id: "canary-reduced-partial",
    when: {
      triggerEquals: { regressionActive: true },
      controlAtMost: { [CANARY_TRAFFIC_PERCENT_KEY]: 10 },
    },
    incidentState: "degraded",
    values: {
      errorRate: 1.2,
      latencyP99Ms: 480,
      memoryUsageMb: 520,
      affectedRequestCount: 420,
      deployStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Escalation: left unmitigated long enough that memory growth
  // compounds the regression's impact.
  {
    id: "memory-growth-escalation",
    when: { triggerEquals: { regressionActive: true, memoryGrowthActive: true } },
    incidentState: "regressing",
    values: {
      errorRate: 11,
      latencyP99Ms: 3_100,
      memoryUsageMb: 1_400,
      affectedRequestCount: 9_000,
      deployStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: regression active, no mitigation.
  {
    id: "regression-critical-default",
    when: { triggerEquals: { regressionActive: true } },
    incidentState: "regressing",
    values: {
      errorRate: 8.5,
      latencyP99Ms: 2_100,
      memoryUsageMb: 780,
      affectedRequestCount: 3_000,
      deployStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no regression active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      errorRate: 0.1,
      latencyP99Ms: 120,
      memoryUsageMb: 400,
      affectedRequestCount: 0,
      deployStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
