import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHING_ENABLED_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  WORKLOAD_ROUTING_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "multi-tenant-api": "healthy",
  "shared-service-fleet": "healthy",
  "shared-data-layer": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "multi-tenant-api": "degraded",
  "shared-service-fleet": "degraded",
  "shared-data-layer": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "multi-tenant-api": "critical",
  "shared-service-fleet": "critical",
  "shared-data-layer": "critical",
};

// Capacity grew (fleet scaled) but nothing constrains the hot tenant's
// share of it — the fleet itself no longer looks saturated, but the
// data layer underneath (shared by everyone) is still being consumed
// disproportionately, so it stays visibly degraded.
const scaledTrapHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "multi-tenant-api": "healthy",
  "shared-service-fleet": "healthy",
  "shared-data-layer": "critical",
};

/**
 * Authored rule table for Uneven Tenant Traffic, ordered most-specific
 * first. One tenant's traffic (a batch job / anomaly on their end) grows
 * sharply and consumes a disproportionate share of the shared service
 * fleet and shared data layer. Every OTHER tenant's own latency
 * (otherTenantLatencyMs) degrades even though the hot tenant's own
 * requests stay fast — proof the hot tenant isn't the one suffering, and
 * that this is a fairness/platform-protection problem, not a "someone is
 * broken" problem.
 *
 * The scenario's binding design requirement: GLOBAL FLEET SCALING ALONE
 * NEVER RESTORES FAIRNESS. Scaling raises the ceiling, but nothing
 * constrains the hot tenant's share of the larger pool, so the hot
 * tenant simply consumes more of the expanded capacity too —
 * otherTenantLatencyMs stays degraded relative to the healthy baseline
 * even once the fleet itself is no longer at its own hard limit (see
 * "fleet-scaled-trap" below, where shared-data-layer pressure remains
 * critical despite a fully scaled, non-saturated fleet).
 *
 * Three distinct, genuinely fair strategies exist:
 *   1. Strict per-tenant quota on the hot tenant (PER_TENANT_QUOTA_KEY)
 *      — the direct fairness lever: caps the hot tenant's own request
 *      rate, restoring every other tenant's latency to baseline at the
 *      real, visible cost of the hot tenant's own throughput
 *      (throttledRequestRatePerSec > 0). OPTIMAL.
 *   2. Tenant isolation (TENANT_ISOLATION_KEY) — moves the hot tenant
 *      onto dedicated capacity. Every other tenant is fully protected
 *      and the hot tenant's own throughput is NOT capped, but dedicated
 *      capacity is a real, ongoing infrastructure cost. ACCEPTABLE
 *      tradeoff (cost vs. throttling).
 *   3. Dedicated workload lane (WORKLOAD_ROUTING_KEY=dedicatedLane) —
 *      caps the hot tenant's consumption of the EXISTING shared pool
 *      without new infrastructure, protecting other tenants at the cost
 *      of the hot tenant's own throughput against the lane ceiling.
 *      ACCEPTABLE, a cheaper but still throughput-capping alternative.
 *
 * Deprioritizing the hot tenant (PRIORITY_CLASS_KEY=deprioritizeHot)
 * reorders queueing but doesn't reduce the hot tenant's actual volume
 * against the shared data layer, so relief is only partial. Caching
 * helps the read portion of the hot tenant's traffic but this incident's
 * load is a write-heavy batch workload, so relief is also only partial.
 */
export const unevenTenantTrafficRules: Rule[] = [
  // ── Optimal recovery: strict per-tenant quota on the hot tenant.
  // Checked first so it wins over every other control combination once
  // applied.
  {
    id: "strict-quota-restores-fairness",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlEquals: { [PER_TENANT_QUOTA_KEY]: "strict" },
    },
    incidentState: "hot-tenant-throttled",
    values: {
      hotTenantQps: 420,
      globalApiLatencyMs: 48,
      otherTenantLatencyMs: 41,
      sharedFleetUtilizationPct: 26,
      sharedDataLayerUtilizationPct: 21,
      throttledRequestRatePerSec: 3_800,
      sharedFleetStatus: "normal",
      tenantFairnessMode: "fair-share-restored",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate good path: tenant isolation. The hot tenant
  // runs on fully separate capacity; every other tenant's metrics are
  // identical to healthy baseline. The hot tenant's own throughput is
  // NOT capped (throttledRequestRatePerSec stays 0) — the cost instead
  // shows up as real, ongoing infrastructure spend (revenue-and-cost.ts).
  {
    id: "tenant-isolation-protects-everyone-at-infra-cost",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlEquals: { [TENANT_ISOLATION_KEY]: true },
    },
    incidentState: "hot-tenant-isolated",
    values: {
      hotTenantQps: 4_200,
      globalApiLatencyMs: 46,
      otherTenantLatencyMs: 40,
      sharedFleetUtilizationPct: 24,
      sharedDataLayerUtilizationPct: 19,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "normal",
      tenantFairnessMode: "fair-share-restored",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate good path: dedicated workload lane. Caps the
  // hot tenant's consumption of the EXISTING shared pool without new
  // infrastructure. Other tenants are protected; the hot tenant's own
  // throughput is capped against the lane's ceiling, visible as a real
  // throttle cost, but no new infrastructure spend is incurred.
  {
    id: "dedicated-lane-caps-hot-tenant-share",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlEquals: { [WORKLOAD_ROUTING_KEY]: "dedicatedLane" },
    },
    incidentState: "hot-tenant-lane-capped",
    values: {
      hotTenantQps: 500,
      globalApiLatencyMs: 47,
      otherTenantLatencyMs: 42,
      sharedFleetUtilizationPct: 27,
      sharedDataLayerUtilizationPct: 22,
      throttledRequestRatePerSec: 3_700,
      sharedFleetStatus: "normal",
      tenantFairnessMode: "fair-share-restored",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful trap: global fleet scaling alone, no fairness control
  // applied. The fleet itself is no longer at its own hard ceiling
  // (sharedFleetUtilizationPct looks fine), but nothing constrains the
  // hot tenant's share of the now-larger pool — the hot tenant's QPS
  // grows to consume more of the expanded capacity too, and the SHARED
  // DATA LAYER underneath (which did not get proportionally bigger)
  // stays critically pressured. otherTenantLatencyMs remains degraded
  // despite the scaled, healthy-looking fleet — the scenario's binding
  // "scaling doesn't fix fairness" requirement.
  {
    id: "fleet-scaled-trap-fairness-not-restored",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlAtLeast: { [GLOBAL_FLEET_SCALING_KEY]: 16 },
      controlEquals: {
        [PER_TENANT_QUOTA_KEY]: "off",
        [TENANT_ISOLATION_KEY]: false,
        [WORKLOAD_ROUTING_KEY]: "direct",
      },
    },
    incidentState: "fleet-scaled-trap",
    values: {
      hotTenantQps: 8_200,
      globalApiLatencyMs: 410,
      otherTenantLatencyMs: 380,
      sharedFleetUtilizationPct: 34,
      sharedDataLayerUtilizationPct: 92,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "critical",
      tenantFairnessMode: "scaled-only",
    },
    componentHealth: scaledTrapHealth,
  },

  // ── Partial relief: deprioritizing the hot tenant's requests at the
  // fleet's scheduler. Reorders queueing so other tenants get served
  // first under contention, giving real relief, but the hot tenant's
  // actual request VOLUME against the shared data layer is unchanged —
  // relief is incomplete.
  {
    id: "deprioritize-hot-tenant-partial-relief",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlEquals: {
        [PRIORITY_CLASS_KEY]: "deprioritizeHot",
        [PER_TENANT_QUOTA_KEY]: "off",
        [TENANT_ISOLATION_KEY]: false,
        [WORKLOAD_ROUTING_KEY]: "direct",
      },
    },
    incidentState: "hot-tenant-deprioritized",
    values: {
      hotTenantQps: 5_600,
      globalApiLatencyMs: 220,
      otherTenantLatencyMs: 95,
      sharedFleetUtilizationPct: 78,
      sharedDataLayerUtilizationPct: 70,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "warning",
      tenantFairnessMode: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial relief: caching enabled, no fairness control applied.
  // The hot tenant's traffic this incident is a write-heavy batch
  // workload — caching absorbs repeat reads but does nothing for the
  // write volume, so relief is real but incomplete.
  {
    id: "caching-partial-relief-write-heavy-workload",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlEquals: {
        [CACHING_ENABLED_KEY]: true,
        [PER_TENANT_QUOTA_KEY]: "off",
        [TENANT_ISOLATION_KEY]: false,
        [WORKLOAD_ROUTING_KEY]: "direct",
      },
    },
    incidentState: "caching-partial",
    values: {
      hotTenantQps: 5_400,
      globalApiLatencyMs: 200,
      otherTenantLatencyMs: 88,
      sharedFleetUtilizationPct: 74,
      sharedDataLayerUtilizationPct: 64,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "warning",
      tenantFairnessMode: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial relief: moderate quota only. Trims the hot tenant's
  // bursts without meaningfully reducing sustained volume.
  {
    id: "moderate-quota-partial-relief",
    when: {
      triggerEquals: { hotTenantTrafficRising: true },
      controlEquals: {
        [PER_TENANT_QUOTA_KEY]: "moderate",
        [TENANT_ISOLATION_KEY]: false,
        [WORKLOAD_ROUTING_KEY]: "direct",
      },
    },
    incidentState: "moderate-quota-partial",
    values: {
      hotTenantQps: 4_100,
      globalApiLatencyMs: 160,
      otherTenantLatencyMs: 72,
      sharedFleetUtilizationPct: 64,
      sharedDataLayerUtilizationPct: 56,
      throttledRequestRatePerSec: 900,
      sharedFleetStatus: "warning",
      tenantFairnessMode: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline: sustained unmitigated hot-tenant volume
  // finally saturates the shared data layer, deepening the already-
  // visible queueing problem for every other tenant. Only reachable
  // once no mitigation above has matched.
  {
    id: "data-layer-saturated-baseline",
    when: { triggerEquals: { hotTenantTrafficRising: true, dataLayerSaturating: true } },
    incidentState: "data-layer-saturated",
    values: {
      hotTenantQps: 9_500,
      globalApiLatencyMs: 650,
      otherTenantLatencyMs: 590,
      sharedFleetUtilizationPct: 96,
      sharedDataLayerUtilizationPct: 99,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "critical",
      tenantFairnessMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: the hot tenant's traffic is rising and the
  // candidate has taken no meaningfully mitigating action yet. Every
  // other tenant's own latency degrades even though the hot tenant's
  // own requests stay comparatively fast — the observable proof that
  // this is a fairness problem, not a "the hot tenant is broken"
  // problem.
  {
    id: "hot-tenant-traffic-baseline",
    when: { triggerEquals: { hotTenantTrafficRising: true } },
    incidentState: "hot-tenant-traffic",
    values: {
      hotTenantQps: 6_800,
      globalApiLatencyMs: 320,
      otherTenantLatencyMs: 260,
      sharedFleetUtilizationPct: 88,
      sharedDataLayerUtilizationPct: 82,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "critical",
      tenantFairnessMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      hotTenantQps: 180,
      globalApiLatencyMs: 45,
      otherTenantLatencyMs: 40,
      sharedFleetUtilizationPct: 22,
      sharedDataLayerUtilizationPct: 18,
      throttledRequestRatePerSec: 0,
      sharedFleetStatus: "normal",
      tenantFairnessMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
