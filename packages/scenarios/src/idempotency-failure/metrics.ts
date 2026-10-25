import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  duplicateSideEffectCount: 0,
  idempotencyStoreHealth: "normal",
  retryCountPerMin: 12,
  requestSuccessRatePct: 99.5,
  externalSideEffectRatePerMin: 400,
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // recording WHY the final state looks the way it does — "safe" means a
  // real, working dedup check is in effect; "unsafe-duplicating" means
  // side effects are actually re-running; "unresolved" is the pre-fix
  // default. Read only by successCondition/scoring, never by any
  // scenario-specific scorer code.
  duplicationSafetyStatus: "unresolved",
};
