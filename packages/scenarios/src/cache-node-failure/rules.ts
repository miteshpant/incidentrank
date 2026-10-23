import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  APPLICATION_CONCURRENCY_KEY,
  CACHE_NODE_COUNT_KEY,
  CACHE_WARMING_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  FAILOVER_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-cluster": "healthy",
  "distributed-cache": "healthy",
  "primary-database": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-cluster": "degraded",
  "distributed-cache": "degraded",
  "primary-database": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-cluster": "degraded",
  "distributed-cache": "critical",
  "primary-database": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-cluster": "healthy",
  "distributed-cache": "healthy",
  "primary-database": "healthy",
};

const warmingSpikeHealth: Record<string, ComponentHealth> = {
  "api-cluster": "degraded",
  "distributed-cache": "degraded",
  "primary-database": "critical",
};

/**
 * Authored rule table for Cache Node Failure, ordered most-specific-first.
 *
 * Shape of the incident: one of three cache nodes fails. Its keys
 * redistribute — some concentrate onto the surviving nodes (raising their
 * load and eviction churn), others fall through as outright misses that
 * hit the database directly. Left alone, this compounds into database
 * connection contention (see timed-events.ts's unmitigated-db-overload).
 *
 * Two genuinely good recovery strategies exist:
 *   (a) replace the lost node's capacity (raise cacheNodeCount above its
 *       original pre-incident size of 3, since the failed node otherwise
 *       stays down and leaving the control unchanged means only 2
 *       effective nodes are actually serving traffic) plus protect the
 *       database from fallback-read pressure while the cache
 *       repopulates (coalescing or rate limiting), or
 *   (b) deliberately route the lost node's keys straight to the database
 *       via originFallback, but ONLY paired with request coalescing so
 *       duplicate concurrent misses for the same key collapse into one
 *       database read — a smaller-footprint fix that never needs extra
 *       cache capacity at all.
 *
 * Two harmful traps exist:
 *   (1) aggressive cache warming — refilling the entire working set as
 *       fast as possible issues a burst of near-simultaneous database
 *       reads that is itself a self-inflicted thundering-herd spike, even
 *       on top of otherwise-reasonable capacity/protection choices.
 *   (2) scaling application concurrency up while the database sits
 *       unprotected (dbRequestProtection "off") and keys are still
 *       falling through — more concurrent API workers just means more
 *       concurrent unprotected reads reaching an already-contended
 *       database.
 */
export const cacheNodeFailureRules: Rule[] = [
  // ── Harmful trap #1: aggressive cache warming. This fires regardless
  // of how good the rest of the configuration is — even with capacity
  // restored and the database protected from fallback reads, slamming
  // the cache with an aggressive full-refill burst produces its own
  // sustained database spike. Ordered first so it always wins when
  // selected.
  {
    id: "aggressive-warming-db-spike",
    when: {
      triggerEquals: { cacheNodeDown: true },
      controlEquals: { [CACHE_WARMING_MODE_KEY]: "aggressive" },
    },
    incidentState: "warming-induced-db-spike",
    values: {
      cacheHitRatePercent: 55,
      dbReadsPerSecond: 3_100,
      cacheNodeLoadPercent: 80,
      apiLatencyMs: 1_450,
      evictionRatePerMinute: 140,
      cacheStatus: "critical",
    },
    componentHealth: warmingSpikeHealth,
  },

  // ── Harmful trap #2: scaling application concurrency up while the
  // database remains unprotected and keys are still falling through to
  // it. More concurrent API workers multiply the unprotected read
  // pressure on an already-contended database rather than relieving it.
  {
    id: "scaled-concurrency-unprotected-db-harmful",
    when: {
      triggerEquals: { cacheNodeDown: true },
      controlEquals: { [DB_REQUEST_PROTECTION_KEY]: "off", [APPLICATION_CONCURRENCY_KEY]: "high" },
      controlAtMost: { [CACHE_NODE_COUNT_KEY]: 3 },
    },
    incidentState: "db-overload-amplified",
    values: {
      cacheHitRatePercent: 48,
      dbReadsPerSecond: 2_600,
      cacheNodeLoadPercent: 88,
      apiLatencyMs: 1_900,
      evictionRatePerMinute: 160,
      cacheStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery path A: replaced node capacity plus real database
  // protection (coalescing or rate limiting) while warming is off or
  // gradual. The cache repopulates safely and the database is shielded
  // from fallback-read pressure in the meantime. Requires raising
  // cacheNodeCount above its original pre-incident size of 3, since the
  // failed node otherwise stays down — leaving the control at 3 means
  // the cluster is still only running on 2 effective nodes.
  {
    id: "capacity-restored-with-db-protection-recovery",
    when: {
      triggerEquals: { cacheNodeDown: true },
      controlAtLeast: { [CACHE_NODE_COUNT_KEY]: 4 },
    },
    incidentState: "recovering",
    values: {
      cacheHitRatePercent: 95,
      dbReadsPerSecond: 95,
      cacheNodeLoadPercent: 38,
      apiLatencyMs: 60,
      evictionRatePerMinute: 8,
      cacheStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Good recovery path B (alternate strategy): origin fallback
  // deliberately routes the lost node's keys straight to the database,
  // but request coalescing collapses concurrent duplicate misses into a
  // single read per key — recovering without touching cache node count
  // at all.
  {
    id: "origin-fallback-with-coalescing-recovery",
    when: {
      triggerEquals: { cacheNodeDown: true },
      controlEquals: {
        [FAILOVER_MODE_KEY]: "originFallback",
        [DB_REQUEST_PROTECTION_KEY]: "coalescing",
      },
    },
    incidentState: "recovering-via-fallback",
    values: {
      cacheHitRatePercent: 90,
      dbReadsPerSecond: 140,
      cacheNodeLoadPercent: 42,
      apiLatencyMs: 75,
      evictionRatePerMinute: 10,
      cacheStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Masking partial: rate limiting alone (no capacity replacement, no
  // coalescing) protects the database by shedding excess fallback reads,
  // which keeps the database's own metrics looking survivable — but the
  // cache hit rate never recovers and shed requests show up as degraded
  // API latency. The underlying capacity problem is still unaddressed.
  {
    id: "rate-limited-without-capacity-masking",
    when: {
      triggerEquals: { cacheNodeDown: true },
      controlEquals: { [DB_REQUEST_PROTECTION_KEY]: "rateLimited" },
      controlAtMost: { [CACHE_NODE_COUNT_KEY]: 3 },
    },
    incidentState: "masked-degradation",
    values: {
      cacheHitRatePercent: 62,
      dbReadsPerSecond: 420,
      cacheNodeLoadPercent: 70,
      apiLatencyMs: 480,
      evictionRatePerMinute: 55,
      cacheStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Compounding failure: the unmitigated-db-overload timed event has
  // fired (sustained unprotected pressure for several minutes) and
  // nothing has protected the database or restored capacity.
  {
    id: "compounded-db-overload-critical",
    when: {
      triggerEquals: { cacheNodeDown: true, dbOverloadCompounded: true },
      controlEquals: { [DB_REQUEST_PROTECTION_KEY]: "off" },
      controlAtMost: { [CACHE_NODE_COUNT_KEY]: 3 },
    },
    incidentState: "db-connection-contention",
    values: {
      cacheHitRatePercent: 40,
      dbReadsPerSecond: 2_900,
      cacheNodeLoadPercent: 92,
      apiLatencyMs: 2_400,
      evictionRatePerMinute: 190,
      cacheStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: node down, no mitigation applied yet — keys
  // redistributing, surviving-node load and eviction churn climbing,
  // database absorbing a meaningful share of unprotected fallback reads.
  {
    id: "node-down-baseline-degraded",
    when: { triggerEquals: { cacheNodeDown: true } },
    incidentState: "node-down-unmitigated",
    values: {
      cacheHitRatePercent: 68,
      dbReadsPerSecond: 650,
      cacheNodeLoadPercent: 75,
      apiLatencyMs: 320,
      evictionRatePerMinute: 60,
      cacheStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Default/fallback: no cache node failure.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      cacheHitRatePercent: 96,
      dbReadsPerSecond: 80,
      cacheNodeLoadPercent: 35,
      apiLatencyMs: 55,
      evictionRatePerMinute: 5,
      cacheStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
