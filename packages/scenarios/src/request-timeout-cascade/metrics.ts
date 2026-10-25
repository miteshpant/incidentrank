import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  dependencyLatencyMs: 90,
  timeoutRateByLayerPercent: 0,
  inFlightRequests: 40,
  abandonedInFlightRequests: 0,
  connectionUtilizationPercent: 12,
  retryVolumePerSecond: 2,
  customerLatencyMs: 220,
  customerSuccessRatePercent: 100,
  chainStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth,
  // Dependency Timeout Cascade's timeoutBudgetHealth) distinguishing WHY
  // the chain looks healthy. "rebudgeted" means the candidate actually
  // re-proportioned the timeout budget end-to-end AND enabled cancellation
  // so abandoned work stops accumulating — the durable fix. "fenced" means
  // the circuit breaker fenced the Dependency off instead — a structurally
  // different, bounded tradeoff. "unresolved" means neither has happened.
  // Read only by successCondition/acceptableCondition/scoring's
  // dataIntegrity-adjacent measure, never by any scenario-specific scorer.
  timeoutBudgetHealth: "unresolved",
};
