import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Per-region success rate against the shared dependency (%).
  usSuccessRate: 99.8,
  euSuccessRate: 99.5,
  apacSuccessRate: 99.6,

  // Per-region p95 latency calling the shared dependency (ms).
  usLatencyMs: 80,
  euLatencyMs: 110,
  apacLatencyMs: 90,

  // Per-region dependency health, as observed by that region. A
  // generic string-state field per Phase 6.1's severity-field
  // precedent (normal | warning | critical), one per region, so each
  // region's health is independently readable rather than collapsed
  // into one global field.
  usDependencyHealth: "normal",
  euDependencyHealth: "normal",
  apacDependencyHealth: "normal",

  // Share of total request volume currently being served by the
  // degraded fallback path instead of a live dependency call (%).
  fallbackTrafficPercent: 0,

  // Total cross-region request volume reaching the shared dependency
  // per minute, summed across all three regions.
  crossRegionRequestVolumePerMinute: 24_000,

  // Global customer success rate — the blended outcome across all
  // three regions, weighted by each region's share of traffic. This
  // is the metric that most directly rewards (or punishes) treating
  // regions differently: a uniform global mitigation that sacrifices a
  // healthy region's success rate to fix a broken region's will show
  // up here as a worse blended number than a region-scoped fix that
  // leaves the healthy region untouched.
  globalCustomerSuccessRate: 99.6,

  // Tracks WHY the incident ended up stable — whether the candidate
  // mitigated region-by-region (preserving the healthy region's full
  // service) or applied a uniform global mitigation (trading away the
  // healthy region's service too). Read only by scoring's generic
  // finalStringEquals measure and the acceptable/success conditions,
  // never by scenario-specific scorer code — same pattern as Missing
  // Database Index's orderHistoryQueryHealth.
  mitigationApproach: "none",
};
