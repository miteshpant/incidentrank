import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
  HEALTH_CHECK_POLICY_KEY,
  RETRY_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-registry": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "service-a": "degraded",
  "service-b": "healthy",
  "service-c": "degraded",
  "service-registry": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-gateway": "degraded",
  "service-a": "critical",
  "service-b": "healthy",
  "service-c": "critical",
  "service-registry": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-registry": "degraded",
};

const capacityPinchedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "service-a": "degraded",
  "service-b": "healthy",
  "service-c": "degraded",
  "service-registry": "healthy",
};

/**
 * Authored rule table for Service Discovery Failure, ordered
 * most-specific-first. The registry begins handing Service A a mix of
 * stale/unhealthy endpoints for Service C once `registryDegraded` is
 * set. The two genuine fixes are (a) refreshing discovery data faster
 * (shorter refresh interval + shorter cache TTL, so stale entries stop
 * being handed out / reused) and (b) enabling fallback routing so Service
 * A can route around a bad snapshot using its own last-known-healthy
 * endpoints. The trap is raising retryCount alone: discovery keeps
 * returning the SAME stale endpoint list, so every extra retry just
 * means more failed connection attempts against the same dead instances
 * — connectionFailuresPerMinute and retryVolumePerMinute both climb
 * rather than recovering. A secondary, non-obvious consequence: setting
 * healthCheckPolicy to "aggressive" without also shortening the refresh
 * interval evicts bad entries from the registry's bookkeeping quickly
 * but Service A doesn't re-poll often enough to receive replacement
 * healthy endpoints, so the effective healthy pool shrinks further
 * before it recovers — pressure moves from "stale endpoints" to "too few
 * endpoints," a real capacity problem, not a free win.
 */
export const serviceDiscoveryRules: Rule[] = [
  // ── Harmful trap: retries pushed high while the registry is degraded
  // and fallback routing is off — every additional retry re-attempts the
  // exact same stale/unhealthy endpoint list discovery keeps handing
  // back, so failure volume and retry volume both climb instead of
  // recovering.
  {
    id: "retry-amplification-harmful",
    when: {
      triggerEquals: { registryDegraded: true },
      controlAtLeast: { [RETRY_COUNT_KEY]: 8 },
      controlEquals: { [FALLBACK_ROUTING_KEY]: false },
    },
    incidentState: "retry-amplification",
    values: {
      connectionFailuresPerMinute: 640,
      healthyEndpointCount: 2,
      discoveryRefreshAgeSeconds: 115,
      serviceCLatencyMs: 2_400,
      retryVolumePerMinute: 5_200,
      discoveryStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: fast discovery refresh + fast endpoint cache TTL +
  // fallback routing — stale entries get evicted and re-polled quickly,
  // and Service A has a safety net routing around whatever snapshot it
  // currently holds. Full, durable recovery.
  {
    id: "fast-refresh-with-fallback-recovery",
    when: {
      triggerEquals: { registryDegraded: true },
      controlAtMost: {
        [DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY]: 10,
        [ENDPOINT_CACHE_TTL_SECONDS_KEY]: 15,
      },
      controlEquals: { [FALLBACK_ROUTING_KEY]: true },
      // Note: deliberately no retry-count bound here. Fast refresh + TTL
      // + fallback routing recovers regardless of retry count — see the
      // completion-mode audit below for why this rule intentionally
      // takes priority over fallback-only/fast-refresh-only.
    },
    incidentState: "recovered",
    values: {
      connectionFailuresPerMinute: 6,
      healthyEndpointCount: 8,
      discoveryRefreshAgeSeconds: 8,
      serviceCLatencyMs: 85,
      retryVolumePerMinute: 22,
      discoveryStatus: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── Alternate good: fallback routing alone (without touching refresh
  // interval/TTL) is enough to route around the bad registry snapshot
  // for live traffic, provided retries are kept modest so the fallback
  // path isn't itself hammered. Slightly slower/noisier than the fast-
  // refresh path (the registry snapshot itself is still stale, just
  // bypassed) but a genuinely full recovery.
  {
    id: "fallback-only-recovery",
    when: {
      triggerEquals: { registryDegraded: true },
      controlEquals: { [FALLBACK_ROUTING_KEY]: true },
      controlAtMost: { [RETRY_COUNT_KEY]: 3 },
    },
    incidentState: "recovered-via-fallback",
    values: {
      connectionFailuresPerMinute: 10,
      healthyEndpointCount: 7,
      discoveryRefreshAgeSeconds: 95,
      serviceCLatencyMs: 110,
      retryVolumePerMinute: 30,
      discoveryStatus: "normal",
    },
    // The registry snapshot itself is still stale here — only the
    // fallback path is masking it for live traffic — so the registry
    // component stays "degraded" even though every candidate-visible
    // customer metric is healthy, distinguishing this from the fully
    // self-healed refresh-based recovery states below.
    componentHealth: recoveringHealth,
  },

  // ── Alternate good: fast refresh + fast cache TTL alone (no fallback
  // routing) also fully recovers — the registry re-polls and the cache
  // re-resolves often enough that stale entries stop being handed out
  // and reused, without needing a bypass path at all.
  {
    id: "fast-refresh-only-recovery",
    when: {
      triggerEquals: { registryDegraded: true },
      controlAtMost: {
        [DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY]: 10,
        [ENDPOINT_CACHE_TTL_SECONDS_KEY]: 15,
        [RETRY_COUNT_KEY]: 3,
      },
    },
    incidentState: "recovered-via-refresh",
    values: {
      connectionFailuresPerMinute: 8,
      healthyEndpointCount: 8,
      discoveryRefreshAgeSeconds: 9,
      serviceCLatencyMs: 90,
      retryVolumePerMinute: 24,
      discoveryStatus: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── Secondary-consequence trap: aggressive health-check eviction
  // without also shortening the refresh interval. The registry evicts
  // failing entries from its bookkeeping quickly, which stops handing
  // out dead endpoints — but Service A/the registry's own refresh cycle
  // is still slow, so no replacement healthy endpoints arrive to fill
  // the gap for a while. The pool of endpoints Service A can actually
  // use shrinks faster than it's replenished: a real capacity problem,
  // distinct from (and caused by) the stale-endpoint problem it was
  // meant to solve.
  {
    id: "aggressive-eviction-without-fast-refresh-capacity-pinch",
    when: {
      triggerEquals: { registryDegraded: true },
      controlEquals: { [HEALTH_CHECK_POLICY_KEY]: "aggressive" },
      controlAtLeast: { [DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY]: 30 },
    },
    incidentState: "capacity-pinched",
    values: {
      connectionFailuresPerMinute: 60,
      healthyEndpointCount: 3,
      discoveryRefreshAgeSeconds: 100,
      serviceCLatencyMs: 520,
      retryVolumePerMinute: 90,
      discoveryStatus: "warning",
    },
    componentHealth: capacityPinchedHealth,
  },

  // ── Partial: moderate refresh/TTL tightening (but not all the way)
  // with retries left at default. Meaningfully better than baseline —
  // stale entries age out somewhat faster — but not sustained-healthy.
  {
    id: "partial-refresh-tightening",
    when: {
      triggerEquals: { registryDegraded: true },
      controlAtMost: { [DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY]: 30 },
    },
    incidentState: "partially-recovering",
    values: {
      connectionFailuresPerMinute: 140,
      healthyEndpointCount: 5,
      discoveryRefreshAgeSeconds: 28,
      serviceCLatencyMs: 310,
      retryVolumePerMinute: 160,
      discoveryStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline degraded: registry degraded, nothing changed from
  // defaults. Connection failures climb and latency rises as Service A
  // keeps resolving (and reusing, for a long cache TTL) the same stale
  // endpoint list, but retries are still at the moderate default so this
  // is the "doing nothing" baseline, not the amplification trap above.
  {
    id: "stale-registry-default",
    when: { triggerEquals: { registryDegraded: true } },
    incidentState: "stale-endpoints",
    values: {
      connectionFailuresPerMinute: 210,
      healthyEndpointCount: 4,
      discoveryRefreshAgeSeconds: 108,
      serviceCLatencyMs: 650,
      retryVolumePerMinute: 230,
      discoveryStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: registry has not yet degraded.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      connectionFailuresPerMinute: 5,
      healthyEndpointCount: 8,
      discoveryRefreshAgeSeconds: 10,
      serviceCLatencyMs: 80,
      retryVolumePerMinute: 20,
      discoveryStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
