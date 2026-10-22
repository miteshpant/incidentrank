import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONNECTION_POOL_SIZE_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  QUERY_TIMEOUT_MS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "query-planner": "healthy",
  "primary-database": "healthy",
  "stats-collector": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "query-planner": "degraded",
  "primary-database": "degraded",
  "stats-collector": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "query-planner": "critical",
  "primary-database": "critical",
  "stats-collector": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "query-planner": "healthy",
  "primary-database": "healthy",
  "stats-collector": "healthy",
};

/**
 * Authored rule table for Slow Query Regression, ordered
 * most-specific-first. Encodes a harmful trap (scaling the connection
 * pool while the index hint stays off — more concurrent full-table-scans
 * now compete for CPU, worsening contention instead of fixing the
 * regression), a clean full-recovery path (forcing the correct index
 * hint restores the fast query plan regardless of pool/timeout), a
 * masking partial (an aggressive timeout kills runaway queries before
 * they time out badly, so error/latency metrics look "contained" but the
 * regression itself is never fixed and throughput never recovers), a
 * smaller partial-improvement path, and a baseline-critical default.
 */
export const regressionRules: Rule[] = [
  // ── Harmful: scaling the connection pool while the index hint is off
  // — more connections now means more full-table-scans running
  // concurrently, which drives CPU utilization even higher than the
  // unmitigated baseline.
  {
    id: "pool-scaled-without-index-hint-harmful",
    when: {
      triggerEquals: { regressionActive: true },
      controlAtLeast: { [CONNECTION_POOL_SIZE_KEY]: 100 },
      controlEquals: { [FORCE_INDEX_HINT_ENABLED_KEY]: false },
    },
    incidentState: "contention-worsened",
    values: {
      queryLatencyP99Ms: 9_200,
      cpuUtilization: 98,
      queuedQueries: 340,
      rowsScanned: 4_200_000,
      queryStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: forcing the correct index hint restores the fast
  // query plan — the regression is fixed regardless of timeout/pool
  // settings.
  {
    id: "index-hint-recovery",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: { [FORCE_INDEX_HINT_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      queryLatencyP99Ms: 50,
      cpuUtilization: 18,
      queuedQueries: 0,
      rowsScanned: 600,
      queryStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Masking partial: an aggressive timeout kills runaway full-scans
  // before they pile up, so queued queries stay low and the dashboard
  // "looks" contained — but the regression is never actually fixed, and
  // the killed queries mean real throughput loss (reflected in elevated
  // CPU from constant query restarts, not resolution).
  {
    id: "aggressive-timeout-masks-symptom",
    when: {
      triggerEquals: { regressionActive: true },
      controlAtMost: { [QUERY_TIMEOUT_MS_KEY]: 1_000 },
      controlEquals: { [FORCE_INDEX_HINT_ENABLED_KEY]: false },
    },
    incidentState: "masked-regression",
    values: {
      queryLatencyP99Ms: 980,
      cpuUtilization: 70,
      queuedQueries: 60,
      rowsScanned: 3_800_000,
      queryStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: moderate pool scaling alone, no index hint —
  // some headroom, regression still unresolved.
  {
    id: "pool-partially-scaled",
    when: {
      triggerEquals: { regressionActive: true },
      controlAtLeast: { [CONNECTION_POOL_SIZE_KEY]: 50 },
    },
    incidentState: "degraded",
    values: {
      queryLatencyP99Ms: 5_400,
      cpuUtilization: 82,
      queuedQueries: 160,
      rowsScanned: 4_000_000,
      queryStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: regression active, no mitigation.
  {
    id: "regression-critical-default",
    when: { triggerEquals: { regressionActive: true } },
    incidentState: "regressed",
    values: {
      queryLatencyP99Ms: 8_500,
      cpuUtilization: 95,
      queuedQueries: 280,
      rowsScanned: 4_100_000,
      queryStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no regression active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      queryLatencyP99Ms: 40,
      cpuUtilization: 15,
      queuedQueries: 0,
      rowsScanned: 500,
      queryStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
