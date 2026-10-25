import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  requestRatePerSec: 800,
  apiCpuUtilization: 20,
  requestQueueDepth: 0,
  dbConnectionUtilization: 18,
  cacheHitRatePct: 92,
  latencyMs: 55,
  errorRatePct: 0,
  dbStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth) distinguishing WHY the system looks
  // healthy — "protected" means the database was genuinely shielded from
  // the cache-miss flood (DB protection and/or cache behavior fixed);
  // "feature-disabled" means the non-critical endpoint was simply turned
  // off; "unresolved" means neither has happened yet. Read only by
  // successCondition/acceptableCondition/scoring, never by scenario-
  // specific scorer code.
  trafficSpikeHealth: "unresolved",
};
