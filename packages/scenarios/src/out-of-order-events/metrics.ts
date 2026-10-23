import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  eventsPerSecond: 2_200,
  consumerLagMessages: 80,
  orderingViolationRate: 0,
  unreconciledViolationCount: 0,
  reconciliationRatePerSecond: 0,
  staleStateCorrectionRate: 0,
  materializedStateStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode / Missing Database Index's orderHistoryQueryHealth)
  // recording WHY the system currently looks the way it does, read only by
  // successCondition/acceptableCondition/scoring's dataIntegrity measure —
  // never by any scenario-specific scorer code.
  //   "unresolved"       — incident active, no stabilizing mitigation yet
  //   "reordering-risk"  — round-robin keying active; violations occur
  //                        but reconciliation is proven to keep pace
  //   "unsafe-divergence"— round-robin keying active WITHOUT the
  //                        safeguards needed to keep reconciliation
  //                        ahead of the violation rate; unreconciled
  //                        corruption accumulates
  //   "ordering-preserved" — per-account causal order fully restored
  orderingIntegrityMode: "unresolved",
};
