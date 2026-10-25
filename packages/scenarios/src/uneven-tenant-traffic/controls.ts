import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The real fairness correction: rate-limits the identified high-volume
 * tenant specifically, independent of total fleet/data-layer capacity.
 * "off" applies no limit (the hot tenant's traffic grows unconstrained);
 * "moderate" trims bursts without materially reducing the tenant's
 * sustained volume; "strict" meaningfully caps the hot tenant's own
 * request rate so every other tenant's share of shared capacity returns
 * to a fair baseline — at the direct, visible cost of the hot tenant's
 * own throughput (throttledRequestRatePerSec > 0). This is the
 * scenario's core "protect the platform vs. protect one tenant's
 * throughput" tradeoff.
 */
export const PER_TENANT_QUOTA_KEY = "perTenantQuota";

/**
 * Broad horizontal scaling of the shared service fleet and the capacity
 * behind it. Per the scenario's binding design requirement, this cannot
 * fix a FAIRNESS problem: nothing constrains the hot tenant's own share
 * of whatever capacity exists, so the hot tenant simply consumes a
 * larger absolute slice of the expanded pool too — other tenants' latency
 * stays degraded relative to what they would get under a fair
 * allocation, even though the fleet is no longer at its own hard ceiling.
 */
export const GLOBAL_FLEET_SCALING_KEY = "globalFleetScaling";

/**
 * Request-priority policy applied at the shared fleet. "standard" treats
 * every tenant's requests identically under contention. "deprioritizeHot"
 * schedules the identified hot tenant's requests at lower priority so
 * other tenants' requests are served first when the fleet is contended —
 * a real, immediate fairness lever, but it only reshuffles queueing
 * order; it does not reduce the hot tenant's actual request volume or
 * its load on the shared data layer underneath.
 */
export const PRIORITY_CLASS_KEY = "priorityClass";

/**
 * Structural isolation: moves the identified hot tenant onto dedicated
 * fleet and data-layer capacity, fully separate from the shared pool
 * every other tenant uses. A genuine fix for fairness — the hot tenant
 * can no longer consume shared capacity at all, and its own throughput
 * is not capped — but dedicated capacity is a real, ongoing infrastructure
 * cost rather than a free reallocation.
 */
export const TENANT_ISOLATION_KEY = "tenantIsolation";

/**
 * Read-through caching in front of the shared data layer. Shields shared
 * capacity from repeat identical reads, but the hot tenant's traffic in
 * this incident is a write-heavy batch workload — cache hits reduce load
 * from the READ portion of that traffic only, so relief is real but
 * incomplete; it does nothing for the write volume driving most of the
 * pressure.
 */
export const CACHING_ENABLED_KEY = "cachingEnabled";

/**
 * Workload routing policy at the API tier. "direct" routes every
 * tenant's requests through the same shared path. "dedicatedLane" routes
 * the identified hot tenant's traffic through a separate, capacity-capped
 * lane carved out of the shared fleet — distinct from tenantIsolation
 * (which provisions wholly separate capacity): a dedicated lane caps how
 * much of the EXISTING shared pool the hot tenant can consume, protecting
 * other tenants without adding new infrastructure, at the cost of
 * capping the hot tenant's own throughput against that lane's ceiling.
 */
export const WORKLOAD_ROUTING_KEY = "workloadRouting";

export const controls: ControlDefinition[] = [
  {
    key: PER_TENANT_QUOTA_KEY,
    allowedValues: ["off", "moderate", "strict"],
    initialValue: "off",
  },
  {
    key: GLOBAL_FLEET_SCALING_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: PRIORITY_CLASS_KEY,
    allowedValues: ["standard", "deprioritizeHot"],
    initialValue: "standard",
  },
  {
    key: TENANT_ISOLATION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CACHING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: WORKLOAD_ROUTING_KEY,
    allowedValues: ["direct", "dedicatedLane"],
    initialValue: "direct",
  },
];
