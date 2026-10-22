import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_TTL_SECONDS_KEY,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "cache-layer": "healthy",
  "origin-database": "healthy",
  "analytics-writer": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "cache-layer": "degraded",
  "origin-database": "degraded",
  "analytics-writer": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "cache-layer": "critical",
  "origin-database": "critical",
  "analytics-writer": "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "cache-layer": "healthy",
  "origin-database": "healthy",
  "analytics-writer": "healthy",
};

/**
 * Authored rule table for Cache Stampede, ordered most-specific-first.
 * Encodes a harmful trap (lowering the TTL further, thinking fresher
 * data helps, actually makes stampedes recur more often), a clean
 * full-recovery path (request coalescing — only one request per expired
 * key reaches the origin, everyone else waits on that result), a
 * cost-wasting partial path (scaling the origin connection pool without
 * coalescing survives the herd at high cost but never stops it from
 * recurring every TTL expiry), a smaller partial-scaling path, and a
 * baseline-critical default.
 */
export const stampedeRules: Rule[] = [
  // ── Harmful: lowering the TTL while the stampede is active — a
  // shorter TTL means the next expiry (and the next herd) arrives
  // sooner, without addressing the actual thundering-herd mechanism.
  {
    id: "lower-ttl-harmful",
    when: {
      triggerEquals: { stampedeActive: true },
      controlAtMost: { [CACHE_TTL_SECONDS_KEY]: 10 },
      controlEquals: { [REQUEST_COALESCING_ENABLED_KEY]: false },
    },
    incidentState: "recurring-stampede",
    values: {
      originRequestRate: 4_200,
      cacheHitRate: 40,
      originLatencyMs: 3_800,
      queuedRequests: 850,
      cacheStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: request coalescing enabled — only one request per
  // expired key reaches the origin, so the herd never forms, regardless
  // of TTL or pool size.
  {
    id: "coalescing-enabled-recovery",
    when: {
      triggerEquals: { stampedeActive: true },
      controlEquals: { [REQUEST_COALESCING_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      originRequestRate: 60,
      cacheHitRate: 97,
      originLatencyMs: 45,
      queuedRequests: 0,
      cacheStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Cost-wasting partial: origin connection pool heavily scaled up,
  // but coalescing stays off — the origin survives the herd (because
  // it now has enough connections to absorb the duplicate requests),
  // but the herd itself never stops recurring at every TTL expiry, and
  // the candidate is now paying for capacity that doesn't fix the
  // underlying problem.
  {
    id: "pool-scaled-without-coalescing",
    when: {
      triggerEquals: { stampedeActive: true },
      controlAtLeast: { [ORIGIN_CONNECTION_POOL_SIZE_KEY]: 200 },
      controlEquals: { [REQUEST_COALESCING_ENABLED_KEY]: false },
    },
    incidentState: "masked-stampede",
    values: {
      originRequestRate: 2_600,
      cacheHitRate: 55,
      originLatencyMs: 600,
      queuedRequests: 80,
      cacheStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: moderate pool scaling, coalescing still off.
  {
    id: "pool-partially-scaled",
    when: {
      triggerEquals: { stampedeActive: true },
      controlAtLeast: { [ORIGIN_CONNECTION_POOL_SIZE_KEY]: 50 },
    },
    incidentState: "degraded",
    values: {
      originRequestRate: 3_400,
      cacheHitRate: 48,
      originLatencyMs: 1_800,
      queuedRequests: 320,
      cacheStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: stampede active, no mitigation.
  {
    id: "stampede-critical-default",
    when: { triggerEquals: { stampedeActive: true } },
    incidentState: "stampeding",
    values: {
      originRequestRate: 4_000,
      cacheHitRate: 42,
      originLatencyMs: 3_200,
      queuedRequests: 700,
      cacheStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no stampede active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      originRequestRate: 50,
      cacheHitRate: 98,
      originLatencyMs: 40,
      queuedRequests: 0,
      cacheStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
