import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { GLOBAL_FLEET_SCALING_KEY, TENANT_ISOLATION_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "data-layer-saturated": 680,
  "fleet-scaled-trap": 560,
  "hot-tenant-traffic": 520,
  "hot-tenant-deprioritized": 180,
  "caching-partial": 170,
  "moderate-quota-partial": 150,
  "hot-tenant-isolated": 0,
  "hot-tenant-lane-capped": 0,
  "hot-tenant-throttled": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${GLOBAL_FLEET_SCALING_KEY}:4`]: 0,
    [`${GLOBAL_FLEET_SCALING_KEY}:8`]: 240,
    [`${GLOBAL_FLEET_SCALING_KEY}:16`]: 560,
    [`${GLOBAL_FLEET_SCALING_KEY}:32`]: 1_200,
    [`${TENANT_ISOLATION_KEY}:false`]: 0,
    // Dedicated capacity for the hot tenant is a real, ongoing
    // infrastructure cost — the direct price of the isolation
    // alternative to throttling the hot tenant's own throughput.
    [`${TENANT_ISOLATION_KEY}:true`]: 900,
  },
};

/**
 * Optimal recovery: every other tenant's own latency is back at a fair
 * baseline AND the shared fleet is no longer under pressure AND
 * tenantFairnessMode is "fair-share-restored" via a direct throughput
 * cap on the hot tenant itself (strict quota, or an equivalent dedicated
 * lane cap) — the real cost is paid visibly by the hot tenant's own
 * throughput (throttledRequestRatePerSec > 0), never hidden. Gating on
 * otherTenantLatencyMs specifically (not just sharedFleetStatus) is
 * deliberate: it's what makes "fleet-scaled-trap" fail this bar even
 * though the fleet itself looks healthy there — see this file's
 * acceptableCondition and definition.ts's completion-mode audit.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "sharedFleetStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "otherTenantLatencyMs", operator: "less_than_or_equal", comparedTo: 50 },
    { key: "tenantFairnessMode", operator: "equals", comparedTo: "fair-share-restored" },
    { key: "throttledRequestRatePerSec", operator: "greater_than", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: every other tenant's own latency is back at a
 * fair baseline and the shared fleet is healthy, reached via dedicated
 * isolated capacity for the hot tenant (tenantFairnessMode =
 * "fair-share-restored" with throttledRequestRatePerSec === 0). This is
 * genuinely safe to hand back — no tenant's throughput is capped and no
 * one else is degraded — but it is bought with a real, ongoing
 * infrastructure cost rather than the direct, zero-marginal-cost
 * throttle. A deliberate, bounded, named tradeoff (cost vs. throttling),
 * not a lesser fix.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "sharedFleetStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "otherTenantLatencyMs", operator: "less_than_or_equal", comparedTo: 50 },
    { key: "tenantFairnessMode", operator: "equals", comparedTo: "fair-share-restored" },
    { key: "throttledRequestRatePerSec", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "sharedDataLayerUtilizationPct", operator: "greater_than_or_equal", comparedTo: 98 },
  ],
  sustainedSeconds: 60,
};
