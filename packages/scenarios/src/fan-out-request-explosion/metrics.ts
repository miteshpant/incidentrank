import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  requestsPerUserRequest: 5,
  downstreamQpsServiceE: 80,
  downstreamQpsServiceA: 80,
  aggregatorLatencyMs: 90,
  partialResponseRatePercent: 0,
  serviceESaturationPercent: 10,
  serviceASaturationPercent: 8,
  customerSuccessRatePercent: 99.5,
  aggregatorStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode / Missing Database Index's
  // orderHistoryQueryHealth) distinguishing WHY the response path looks
  // healthy — "core-path-intact" means pricing/inventory/shipping/tax are
  // all still being served correctly (enrichment may or may not be
  // included); "core-path-at-risk" means the mitigation applied is
  // itself pressuring a CORE dependency (Service A), not just the
  // optional one. Read only by successCondition/scoring, never by any
  // scenario-specific scorer code.
  corePathHealth: "core-path-intact",
};
