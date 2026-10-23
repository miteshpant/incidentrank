import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  serviceCLatencyMs: 80,
  serviceBLatencyMs: 110,
  serviceALatencyMs: 140,
  apiLatencyMs: 170,
  timeoutRatePercent: 0,
  serviceBOutstandingRequests: 20,
  serviceAOutstandingRequests: 20,
  apiOutstandingRequests: 20,
  serviceBPoolUtilization: 10,
  serviceAPoolUtilization: 10,
  apiPoolUtilization: 10,
  serviceCConnectionsInUse: 15,
  customerSuccessRatePercent: 100,
  chainStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // distinguishing WHY the chain looks healthy — "budgeted" means the
  // candidate actually re-proportioned the timeout budget end-to-end (and/
  // or fenced C off with the circuit breaker) so no hop can ever block
  // waiting on a slow downstream call; "masked" means retries/timeouts
  // were tuned just enough to clear the visible metrics while a hop still
  // blocks on C under the hood; "unresolved" means neither has happened.
  // Read only by successCondition/acceptableCondition/scoring's
  // dataIntegrity-adjacent measure, never by any scenario-specific scorer.
  timeoutBudgetHealth: "unresolved",
};
