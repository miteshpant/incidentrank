import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_EVICTION_POLICY_ENABLED_KEY,
  MANUAL_RESTART_TRIGGERED_KEY,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "request-handler": "healthy",
  "in-memory-cache": "healthy",
  "process-supervisor": "healthy",
  "downstream-database": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "request-handler": "degraded",
  "in-memory-cache": "degraded",
  "process-supervisor": "healthy",
  "downstream-database": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-service": "critical",
  "request-handler": "critical",
  "in-memory-cache": "critical",
  "process-supervisor": "degraded",
  "downstream-database": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "request-handler": "healthy",
  "in-memory-cache": "healthy",
  "process-supervisor": "healthy",
  "downstream-database": "healthy",
};

/**
 * Authored rule table for Memory Leak, ordered most-specific-first.
 * Encodes a harmful-if-relied-on-alone trap (a one-time manual restart
 * with no durable auto-restart policy — memory climbs right back to
 * critical once the leak recurs), a clean durable-recovery path
 * (memoryLimitAutoRestartEnabled=true, a circuit-breaker-like safety
 * net), a partial path (bounded cache eviction alone slows but does not
 * fully stop the climb, since the leak may have other sources too), a
 * smaller partial that looks good only until the recurrence event proves
 * it wasn't durable, a baseline-critical default, and a healthy fallback.
 */
export const leakRules: Rule[] = [
  // ── Harmful if relied on alone: a one-time restart with no durable
  // auto-restart policy, once the leak has recurred — nothing structural
  // changed, so memory has climbed right back to critical.
  {
    id: "restart-alone-no-durable-fix-harmful",
    when: {
      triggerEquals: { leakActive: true, leakRecurred: true },
      controlEquals: {
        [MANUAL_RESTART_TRIGGERED_KEY]: true,
        [MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY]: false,
      },
    },
    incidentState: "leak-recurred-critical",
    values: {
      memoryUsageMb: 3_800,
      gcPauseMs: 850,
      errorRate: 14,
      processRestartCount: 1,
      serviceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good durable recovery: the auto-restart policy is in place — a
  // safety net that restarts the process before it ever reaches a
  // critical OOM state again, regardless of whether a manual restart was
  // also triggered or whether the leak has recurred.
  {
    id: "auto-restart-policy-recovery",
    when: {
      triggerEquals: { leakActive: true },
      controlEquals: { [MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      memoryUsageMb: 420,
      gcPauseMs: 18,
      errorRate: 0.2,
      processRestartCount: 1,
      serviceStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial: bounded cache eviction slows the climb meaningfully, but
  // does not fully stop it — the leak may have sources beyond the cache.
  {
    id: "cache-eviction-partial",
    when: {
      triggerEquals: { leakActive: true },
      controlEquals: { [CACHE_EVICTION_POLICY_ENABLED_KEY]: true },
    },
    incidentState: "degraded",
    values: {
      memoryUsageMb: 1_800,
      gcPauseMs: 220,
      errorRate: 3,
      processRestartCount: 0,
      serviceStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Smaller partial: a one-time manual restart, BEFORE the leak has
  // recurred — looks like it worked, since memory was just cleared. This
  // is intentionally the trap that only reveals itself once time passes
  // and the recurrence event fires.
  {
    id: "manual-restart-only-temporary",
    when: {
      triggerEquals: { leakActive: true },
      controlEquals: { [MANUAL_RESTART_TRIGGERED_KEY]: true },
    },
    incidentState: "restarted-temporary",
    values: {
      memoryUsageMb: 420,
      gcPauseMs: 18,
      errorRate: 0.2,
      processRestartCount: 1,
      serviceStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Escalation: the leak has recurred and nothing durable was ever
  // put in place — worse than the original baseline since memory has
  // now climbed for longer in total.
  {
    id: "leak-recurred-unmitigated",
    when: { triggerEquals: { leakActive: true, leakRecurred: true } },
    incidentState: "leak-recurred-critical",
    values: {
      memoryUsageMb: 3_800,
      gcPauseMs: 850,
      errorRate: 14,
      processRestartCount: 0,
      serviceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: leak active, no mitigation.
  {
    id: "leak-critical-default",
    when: { triggerEquals: { leakActive: true } },
    incidentState: "leaking",
    values: {
      memoryUsageMb: 2_600,
      gcPauseMs: 480,
      errorRate: 8,
      processRestartCount: 0,
      serviceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no leak trigger active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      memoryUsageMb: 400,
      gcPauseMs: 15,
      errorRate: 0.1,
      processRestartCount: 0,
      serviceStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
