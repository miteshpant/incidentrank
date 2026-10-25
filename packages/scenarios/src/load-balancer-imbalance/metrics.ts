import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  instanceARequestRate: 100,
  instanceBRequestRate: 100,
  instanceCRequestRate: 100,
  instanceDRequestRate: 100,
  instanceALatencyMs: 40,
  instanceBLatencyMs: 40,
  instanceCLatencyMs: 40,
  instanceDLatencyMs: 40,
  instanceAConnectionCount: 50,
  instanceBConnectionCount: 50,
  healthyBackendCount: 4,
  globalSuccessRatePct: 100,
  balancerStatus: "normal",
  // Generic string-state field distinguishing WHY the fleet looks even
  // (if it does): "rebalanced" means the imbalance mechanism itself was
  // actually corrected (strategy/sticky-session fix); "capacity-added"
  // means only instanceCount/weights changed while the pinning mechanism
  // stayed in place; "unresolved" means neither has happened. Read only
  // by scoring's dataIntegrity-adjacent measure and the completion
  // conditions, never by any scenario-specific scorer code.
  imbalanceRootCause: "unresolved",
};
