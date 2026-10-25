import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 nodes, 5 edges — flat (ArchitectureNode/ArchitectureEdge per
 * phase-6e-strategy-spec.md section 15; no groups/containers/nesting).
 * Checkout -> Payment API is the candidate traffic path; Payment API
 * fans out to the Fraud Service (which depends on the Rules Engine for
 * local scoring and the External Risk Provider for live risk signal)
 * and, independently, to the Ledger (every completed transaction is
 * recorded regardless of how it was screened — the Ledger is never
 * itself degraded by this incident, a deliberate decoy-healthy signal
 * mirroring Identity Platform Degradation's Token Verification: a
 * healthy Ledger write rate says nothing about whether what got
 * written was adequately screened for fraud).
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "checkout", label: "Checkout" },
    { id: "payment-api", label: "Payment API" },
    { id: "fraud-service", label: "Fraud Service" },
    { id: "rules-engine", label: "Rules Engine" },
    { id: "external-risk-provider", label: "External Risk Provider" },
    { id: "ledger", label: "Ledger" },
  ],
  edges: [
    { from: "checkout", to: "payment-api" },
    { from: "payment-api", to: "fraud-service" },
    { from: "fraud-service", to: "rules-engine" },
    { from: "fraud-service", to: "external-risk-provider" },
    { from: "payment-api", to: "ledger" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  checkout: "healthy",
  "payment-api": "healthy",
  "fraud-service": "healthy",
  "rules-engine": "healthy",
  "external-risk-provider": "healthy",
  ledger: "healthy",
};
