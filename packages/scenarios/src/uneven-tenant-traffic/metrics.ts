import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // The hot tenant's own QPS — rising sharply once the incident begins.
  hotTenantQps: 180,
  // Global p95 latency across the shared fleet, affecting every tenant.
  globalApiLatencyMs: 45,
  // A representative OTHER tenant's own latency — the key proof that the
  // hot tenant isn't even the one suffering: it climbs for everyone
  // ELSE sharing the fleet/data layer while the hot tenant's own
  // requests stay fast.
  otherTenantLatencyMs: 40,
  sharedFleetUtilizationPct: 22,
  sharedDataLayerUtilizationPct: 18,
  throttledRequestRatePerSec: 0,
  sharedFleetStatus: "normal",
  // Generic string-state field distinguishing WHY the platform looks
  // healthy (if it does) — "unresolved" means the hot tenant's traffic
  // is still unconstrained; "fair-share-restored" means a genuine
  // fairness fix is in effect (quota, isolation, or dedicated lane);
  // "scaled-only" marks the trap state where capacity grew but nothing
  // constrains the hot tenant's share of it. Read only by
  // successCondition/acceptableCondition/scoring, never by any
  // scenario-specific scorer code.
  tenantFairnessMode: "unresolved",
};
