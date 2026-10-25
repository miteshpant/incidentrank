import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  quotaRemainingPct: 100,
  dependency429RatePerMin: 0,
  applicationSuccessRatePct: 100,
  retryVolumePerMin: 0,
  cacheHitRatePct: 0,
  requestPriorityMixPct: 100,
  dependencyCallVolumePerMin: 1_000,
  quotaStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth, Kafka Partition Skew's
  // orderingMode) distinguishing WHY the quota looks healthy, read only
  // by successCondition/acceptableCondition/scoring's measures, never by
  // scenario-specific scorer code:
  //   "unresolved"           — incident still active, no stable outcome yet
  //   "sustained-under-quota" — genuine fix: call volume durably reduced
  //                              below the quota's burn rate for the rest
  //                              of the window (caching/coalescing/priority)
  //   "feature-suppressed"   — quota pressure relieved only by turning off
  //                              the optional enrichment feature
  //   "exhausted"            — the quota hit zero before the window reset
  quotaOutcome: "unresolved",
};
