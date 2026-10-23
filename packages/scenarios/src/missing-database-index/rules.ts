import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TARGETED_INDEX_ENABLED_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-service": "healthy",
  "orders-service": "healthy",
  "postgresql-primary": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-service": "degraded",
  "orders-service": "degraded",
  "postgresql-primary": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-service": "critical",
  "orders-service": "critical",
  "postgresql-primary": "critical",
};

const dbCriticalApiHealthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-service": "healthy",
  "orders-service": "degraded",
  "postgresql-primary": "critical",
};

/**
 * Authored rule table for Missing Database Index, ordered most-specific
 * first. The recently deployed order-history query path has no
 * supporting index; as traffic rises it performs full-table scans. The
 * durable fix is the database-side index. Two harmful traps exist:
 * scaling API instances (more concurrent scanners → worse DB CPU/lock
 * pressure, the scenario's binding design requirement) and raising the
 * DB connection pool alone (widens the pipe into an already-overloaded
 * primary rather than shrinking the work). Disabling the endpoint and
 * reducing page size are real, partial/acceptable mitigations that do
 * not touch the root cause. The temporary cache only helps once it is
 * warm; a cold cache under live load still has to fill via the same
 * unindexed scan.
 */
export const missingDatabaseIndexRules: Rule[] = [
  // ── Strong recovery: the targeted index is enabled. Scans become
  // index seeks; scanned rows, DB CPU, query/API latency, and connection
  // utilization all drop regardless of how the other controls are set,
  // because the root cause (no index) is fixed. This is intentionally
  // the first trigger-gated rule so it wins over every control
  // combination below once the index is live.
  {
    id: "indexed-recovery",
    when: {
      triggerEquals: { trafficRising: true },
      controlEquals: { [TARGETED_INDEX_ENABLED_KEY]: true },
    },
    incidentState: "recovered-indexed",
    values: {
      queryLatencyMs: 35,
      dbCpuUtilization: 18,
      scannedRowsPerQuery: 12,
      dbConnectionUtilization: 20,
      apiLatencyMs: 55,
      requestQueueDepth: 0,
      dbStatus: "normal",
      orderHistoryQueryHealth: "indexed",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful: API instances scaled up while the index is still
  // missing. Every added instance runs its own share of concurrent
  // full-table-scan queries against the same primary, so DB CPU,
  // connection utilization, and lock pressure all get WORSE than the
  // unscaled baseline, even though the API layer itself has more
  // capacity to accept requests. This is the scenario's binding design
  // requirement: capacity alone cannot fix a missing index.
  {
    id: "scaled-api-worsens-contention",
    when: {
      triggerEquals: { trafficRising: true },
      controlAtLeast: { [API_INSTANCE_COUNT_KEY]: 16 },
      controlEquals: {
        [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: true,
      },
    },
    incidentState: "scaled-contention",
    values: {
      queryLatencyMs: 2_400,
      dbCpuUtilization: 98,
      scannedRowsPerQuery: 950_000,
      dbConnectionUtilization: 96,
      apiLatencyMs: 2_100,
      requestQueueDepth: 540,
      dbStatus: "critical",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: dbCriticalApiHealthyHealth,
  },

  // ── Harmful: connection pool widened alone while the index is
  // missing and the endpoint stays enabled. More concurrent scanning
  // queries get to run at once instead of queueing at the pool
  // boundary, so DB CPU climbs further even as apiLatencyMs/
  // requestQueueDepth look slightly better (the queueing just moved
  // from the API layer into the database itself).
  {
    id: "widened-pool-worsens-db-cpu",
    when: {
      triggerEquals: { trafficRising: true },
      controlAtLeast: { [DB_CONNECTION_POOL_SIZE_KEY]: 100 },
      controlEquals: {
        [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: true,
        [TARGETED_INDEX_ENABLED_KEY]: false,
      },
    },
    incidentState: "pool-widened-contention",
    values: {
      queryLatencyMs: 1_900,
      dbCpuUtilization: 99,
      scannedRowsPerQuery: 900_000,
      dbConnectionUtilization: 90,
      apiLatencyMs: 900,
      requestQueueDepth: 60,
      dbStatus: "critical",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Acceptable mitigation: the expensive endpoint is disabled. Load
  // against Postgres from this query path drops to zero, so every
  // metric recovers — but nothing about the missing index was actually
  // fixed, and a real customer-facing feature (order history) is now
  // unavailable. Second-wave pool-saturation trigger is irrelevant once
  // the endpoint generating the load is off.
  {
    id: "endpoint-disabled-safe-but-degraded-feature",
    when: {
      triggerEquals: { trafficRising: true },
      controlEquals: { [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: false },
    },
    incidentState: "endpoint-disabled",
    values: {
      queryLatencyMs: 30,
      dbCpuUtilization: 14,
      scannedRowsPerQuery: 0,
      dbConnectionUtilization: 16,
      apiLatencyMs: 50,
      requestQueueDepth: 0,
      dbStatus: "normal",
      orderHistoryQueryHealth: "feature-disabled",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial, still degraded: smaller query page size reduces the
  // amount of row data copied back per request, giving modest relief,
  // but every request is still a full-table scan at full cardinality —
  // the underlying cause remains. Matches the second-wave pool
  // saturation trigger too, since page size alone does not prevent it.
  {
    id: "smaller-page-size-partial-relief",
    when: {
      triggerEquals: { trafficRising: true },
      controlAtMost: { [QUERY_PAGE_SIZE_KEY]: 100 },
      controlEquals: {
        [TARGETED_INDEX_ENABLED_KEY]: false,
        [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: true,
      },
    },
    incidentState: "page-size-reduced",
    values: {
      queryLatencyMs: 650,
      dbCpuUtilization: 62,
      scannedRowsPerQuery: 400_000,
      dbConnectionUtilization: 55,
      apiLatencyMs: 520,
      requestQueueDepth: 90,
      dbStatus: "warning",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial, still degraded: temporary cache enabled without the
  // index. Repeat identical lookups are served from cache, but every
  // cache miss (including the initial warm-up under live load) still
  // runs the same unindexed full-table scan, so relief is incomplete.
  {
    id: "cache-enabled-partial-relief",
    when: {
      triggerEquals: { trafficRising: true },
      controlEquals: {
        [TEMPORARY_CACHE_ENABLED_KEY]: true,
        [TARGETED_INDEX_ENABLED_KEY]: false,
        [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: true,
      },
    },
    incidentState: "cache-warming",
    values: {
      queryLatencyMs: 580,
      dbCpuUtilization: 58,
      scannedRowsPerQuery: 380_000,
      dbConnectionUtilization: 50,
      apiLatencyMs: 480,
      requestQueueDepth: 70,
      dbStatus: "warning",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline: sustained scan load finally saturates the
  // connection pool, deepening the already-visible queueing problem.
  // Only reachable once no mitigation above has matched.
  {
    id: "pool-saturating-baseline",
    when: {
      triggerEquals: { trafficRising: true, poolSaturating: true },
      controlEquals: { [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: true },
    },
    incidentState: "pool-saturated",
    values: {
      queryLatencyMs: 2_200,
      dbCpuUtilization: 95,
      scannedRowsPerQuery: 900_000,
      dbConnectionUtilization: 99,
      apiLatencyMs: 1_800,
      requestQueueDepth: 620,
      dbStatus: "critical",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: traffic is rising against the unindexed
  // query path and the candidate has taken no meaningfully mitigating
  // action yet.
  {
    id: "full-table-scan-baseline",
    when: {
      triggerEquals: { trafficRising: true },
      controlEquals: { [ORDER_HISTORY_ENDPOINT_ENABLED_KEY]: true },
    },
    incidentState: "full-table-scan",
    values: {
      queryLatencyMs: 1_600,
      dbCpuUtilization: 88,
      scannedRowsPerQuery: 850_000,
      dbConnectionUtilization: 80,
      apiLatencyMs: 1_300,
      requestQueueDepth: 310,
      dbStatus: "critical",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      queryLatencyMs: 40,
      dbCpuUtilization: 12,
      scannedRowsPerQuery: 400,
      dbConnectionUtilization: 15,
      apiLatencyMs: 60,
      requestQueueDepth: 0,
      dbStatus: "normal",
      orderHistoryQueryHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
