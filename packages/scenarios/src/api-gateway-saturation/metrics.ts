import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  gatewayQueueDepth: 0,
  gatewayCpuUtilization: 14,
  backendUtilization: 10,
  gatewayConnectionCount: 80,
  downstreamLatencyMs: 12,
  customerLatencyMs: 45,
  gatewayStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Missing Database
  // Index's orderHistoryQueryHealth) distinguishing WHY the gateway
  // looks healthy — "fixed" means the actual per-request overhead
  // (connection churn + route-matching cost) was removed; "bypassed"
  // means authentication/authorization enforcement was disabled
  // instead; "unresolved" means neither has happened yet. Read only by
  // successCondition/acceptableCondition/scoring's dataIntegrity
  // measure, never by any scenario-specific scorer code.
  gatewaySaturationHealth: "unresolved",
};
