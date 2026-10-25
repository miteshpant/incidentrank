import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  serviceLatencyMs: 220,
  duplicateRequestRatePct: 0,
  retryVolumePerMin: 4,
  sideEffectCount: 100,
  idempotencyHitRatePct: 0,
  customerErrorRatePct: 0,
  serviceStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // tracking WHETHER a real correctness violation (an order side effect
  // executed more than once for the same logical request) has actually
  // occurred — read only by successCondition/scoring, never by any
  // scenario-specific scorer code. "duplicating" means duplicate side
  // effects are actively occurring; "deduplicated" means the idempotency
  // key check is genuinely in effect and no duplicate has occurred since;
  // "unresolved" is the pre-incident/no-op default.
  duplicateSideEffectStatus: "unresolved",
};
