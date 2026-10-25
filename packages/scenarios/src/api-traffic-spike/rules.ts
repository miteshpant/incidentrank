import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  CACHE_BEHAVIOR_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
  RATE_LIMIT_MODE_KEY,
  REQUEST_QUEUE_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "api-fleet": "healthy",
  database: "healthy",
  cache: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "api-fleet": "degraded",
  database: "degraded",
  cache: "degraded",
};

const dbCriticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "api-fleet": "degraded",
  database: "critical",
  cache: "degraded",
};

const dbCriticalApiHealthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "api-fleet": "healthy",
  database: "critical",
  cache: "critical",
};

/**
 * Authored rule table for API Traffic Spike, ordered most-specific first.
 * A legitimate traffic spike shifts the request mix toward a wider, colder
 * set of cache keys. As the cache hit rate falls, the volume of queries
 * falling through to the database rises, and the database connection pool
 * — not raw API CPU — is the actual constrained resource. Two durable
 * fixes exist and either one (or both together) resolves the incident:
 *
 *   1. dbProtectionMode=strict — admission control/statement timeouts at
 *      the database directly shield the connection pool from the
 *      cache-miss flood.
 *   2. cacheBehaviorMode=extendedTtl — raising hit rate for the new key
 *      pattern reduces the volume of queries that ever reach the
 *      database in the first place.
 *
 * Two harmful traps mirror the scenario's binding design requirement:
 * scaling API instances broadly, and widening the DB connection pool
 * alone — both simply let more concurrent cache-miss queries reach the
 * same overloaded database rather than reducing the work it has to do.
 * Rate limiting and disabling the non-critical endpoint are real,
 * genuinely safe mitigations that trade away legitimate traffic/features
 * rather than fixing the downstream bottleneck. Bounding the request
 * queue alone gives real but incomplete relief (it protects the API tier,
 * not the database).
 */
export const apiTrafficSpikeRules: Rule[] = [
  // ── Optimal recovery: both root fixes applied. Cache hit rate
  // recovers, DB connection pressure drops, and every customer-facing
  // metric returns to a durable healthy baseline. Checked first so it
  // wins over every other control combination once both fixes are live.
  {
    id: "both-fixes-recovery",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: {
        [DB_PROTECTION_MODE_KEY]: "strict",
        [CACHE_BEHAVIOR_KEY]: "extendedTtl",
      },
    },
    incidentState: "recovered-protected",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 38,
      requestQueueDepth: 0,
      dbConnectionUtilization: 22,
      cacheHitRatePct: 94,
      latencyMs: 58,
      errorRatePct: 0,
      dbStatus: "normal",
      trafficSpikeHealth: "protected",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal alternate path: cache behavior fixed alone. Raising hit
  // rate for the spike's wider key pattern removes most of the fall-
  // through load before it ever reaches the database, so the database
  // itself recovers even with admission control untouched — fixing the
  // root cause from the cache side is equally durable.
  {
    id: "cache-fix-recovery",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: { [CACHE_BEHAVIOR_KEY]: "extendedTtl" },
    },
    incidentState: "recovered-cache-fixed",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 40,
      requestQueueDepth: 0,
      dbConnectionUtilization: 26,
      cacheHitRatePct: 93,
      latencyMs: 62,
      errorRatePct: 0,
      dbStatus: "normal",
      trafficSpikeHealth: "protected",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate path: DB protection fixed alone, cache
  // behavior untouched. Admission control shields the connection pool
  // from runaway query pile-up, so the database itself stays stable and
  // customer-facing latency/error rate are healthy — but the cache hit
  // rate never recovers, so the database keeps absorbing a materially
  // higher baseline load than it would with the cache fixed too. Safe to
  // hand back, but not the fullest recovery.
  {
    id: "db-protection-alone-acceptable",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: {
        [DB_PROTECTION_MODE_KEY]: "strict",
        [CACHE_BEHAVIOR_KEY]: "shortTtl",
      },
    },
    incidentState: "db-protected-cache-cold",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 44,
      requestQueueDepth: 15,
      dbConnectionUtilization: 58,
      cacheHitRatePct: 48,
      latencyMs: 190,
      errorRatePct: 0,
      dbStatus: "warning",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful: API instances scaled broadly while the cache is still
  // cold and DB protection is off. Every added instance forwards more
  // concurrent cache-miss queries into the same exhausted connection
  // pool, so DB connection utilization and latency get WORSE than the
  // unscaled baseline, even though the API tier itself has more headroom
  // to accept requests. This is the scenario's binding design
  // requirement: capacity at the wrong tier cannot fix a downstream
  // bottleneck.
  {
    id: "scaled-api-worsens-db-contention",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlAtLeast: { [API_INSTANCE_COUNT_KEY]: 16 },
      controlEquals: {
        [DB_PROTECTION_MODE_KEY]: "relaxed",
        [CACHE_BEHAVIOR_KEY]: "shortTtl",
      },
    },
    incidentState: "scaled-contention",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 35,
      requestQueueDepth: 0,
      dbConnectionUtilization: 99,
      cacheHitRatePct: 22,
      latencyMs: 2_400,
      errorRatePct: 18,
      dbStatus: "critical",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: dbCriticalApiHealthyHealth,
  },

  // ── Harmful: DB connection pool widened alone while the cache stays
  // cold and protection is off. More concurrent cache-miss queries get
  // to run at once instead of queueing for a connection, so database CPU
  // and lock pressure climb further even as queueing briefly looks
  // better — the bottleneck just moved deeper into the database itself.
  {
    id: "widened-pool-worsens-db-pressure",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlAtLeast: { [DB_CONNECTION_POOL_SIZE_KEY]: 100 },
      controlEquals: {
        [DB_PROTECTION_MODE_KEY]: "relaxed",
        [CACHE_BEHAVIOR_KEY]: "shortTtl",
      },
    },
    incidentState: "pool-widened-contention",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 42,
      requestQueueDepth: 40,
      dbConnectionUtilization: 97,
      cacheHitRatePct: 24,
      latencyMs: 1_950,
      errorRatePct: 14,
      dbStatus: "critical",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: dbCriticalHealth,
  },

  // ── Acceptable mitigation: rate limiting turned on. Legitimate
  // customer traffic reaching the API fleet is directly throttled, so
  // load on both the cache and the database drops and every
  // customer-facing metric recovers — but real, non-malicious requests
  // are now being rejected during the spike, a direct, visible tradeoff
  // rather than a downstream fix.
  {
    id: "rate-limited-safe-but-throttled",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: { [RATE_LIMIT_MODE_KEY]: "on" },
    },
    incidentState: "rate-limited",
    values: {
      requestRatePerSec: 1_100,
      apiCpuUtilization: 24,
      requestQueueDepth: 0,
      dbConnectionUtilization: 30,
      cacheHitRatePct: 70,
      latencyMs: 70,
      errorRatePct: 9,
      dbStatus: "normal",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable mitigation: non-critical endpoint disabled. Load from
  // that read-heavy reporting path drops to zero on both the cache and
  // the database, so every metric recovers — but nothing about the
  // underlying cache/DB bottleneck was fixed, and a real feature is now
  // unavailable to customers.
  {
    id: "endpoint-disabled-safe-but-degraded-feature",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: { [NON_CRITICAL_ENDPOINT_ENABLED_KEY]: false },
    },
    incidentState: "endpoint-disabled",
    values: {
      requestRatePerSec: 2_600,
      apiCpuUtilization: 26,
      requestQueueDepth: 0,
      dbConnectionUtilization: 28,
      cacheHitRatePct: 90,
      latencyMs: 60,
      errorRatePct: 0,
      dbStatus: "normal",
      trafficSpikeHealth: "feature-disabled",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial, still degraded: bounded request queue alone. Protects
  // the API tier from unbounded concurrency (queue depth stays
  // controlled), but every admitted request still falls through to the
  // same cold cache and overloaded database, so DB connection pressure
  // and latency remain elevated.
  {
    id: "bounded-queue-partial-relief",
    when: {
      triggerEquals: { trafficSpiking: true },
      controlEquals: {
        [REQUEST_QUEUE_MODE_KEY]: "bounded",
        [DB_PROTECTION_MODE_KEY]: "relaxed",
        [CACHE_BEHAVIOR_KEY]: "shortTtl",
        [RATE_LIMIT_MODE_KEY]: "off",
      },
    },
    incidentState: "queue-bounded-partial",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 40,
      requestQueueDepth: 25,
      dbConnectionUtilization: 86,
      cacheHitRatePct: 30,
      latencyMs: 820,
      errorRatePct: 6,
      dbStatus: "warning",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline: sustained unmitigated cache-miss load
  // finally saturates the connection pool, deepening the already-visible
  // queueing/latency problem. Only reachable once no mitigation above
  // has matched.
  {
    id: "pool-saturating-baseline",
    when: { triggerEquals: { trafficSpiking: true, poolSaturating: true } },
    incidentState: "pool-saturated",
    values: {
      requestRatePerSec: 4_600,
      apiCpuUtilization: 46,
      requestQueueDepth: 310,
      dbConnectionUtilization: 99,
      cacheHitRatePct: 18,
      latencyMs: 3_100,
      errorRatePct: 24,
      dbStatus: "critical",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: dbCriticalHealth,
  },

  // ── Baseline critical: traffic is spiking against a cold-cache key
  // pattern and the candidate has taken no meaningfully mitigating
  // action yet.
  {
    id: "traffic-spike-baseline",
    when: { triggerEquals: { trafficSpiking: true } },
    incidentState: "traffic-spiking",
    values: {
      requestRatePerSec: 4_200,
      apiCpuUtilization: 48,
      requestQueueDepth: 90,
      dbConnectionUtilization: 82,
      cacheHitRatePct: 35,
      latencyMs: 640,
      errorRatePct: 4,
      dbStatus: "warning",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestRatePerSec: 800,
      apiCpuUtilization: 20,
      requestQueueDepth: 0,
      dbConnectionUtilization: 18,
      cacheHitRatePct: 92,
      latencyMs: 55,
      errorRatePct: 0,
      dbStatus: "normal",
      trafficSpikeHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
