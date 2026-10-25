import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 12 logical nodes — US and EU regional payment stacks, the shared
 * global router, and the two cross-region shared dependencies (Fraud
 * Provider, Settlement Pipeline) that both regions' ledgers ultimately
 * feed into. Flat ArchitectureNode/ArchitectureEdge representation per
 * phase6dsupport.md section 3 — no region containers or nested groups.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "global-traffic-manager", label: "Global Traffic Manager" },
    { id: "us-payment-api", label: "US Payment API" },
    { id: "us-risk-service", label: "US Risk Service" },
    { id: "us-ledger", label: "US Ledger" },
    { id: "us-event-publisher", label: "US Event Publisher" },
    { id: "eu-payment-api", label: "EU Payment API" },
    { id: "eu-risk-service", label: "EU Risk Service" },
    { id: "eu-ledger-replica", label: "EU Ledger / Replica" },
    { id: "eu-event-publisher", label: "EU Event Publisher" },
    { id: "fraud-provider", label: "Fraud Provider" },
    { id: "settlement-pipeline", label: "Settlement Pipeline" },
  ],
  edges: [
    { from: "clients", to: "global-traffic-manager" },
    { from: "global-traffic-manager", to: "us-payment-api" },
    { from: "global-traffic-manager", to: "eu-payment-api" },

    { from: "us-payment-api", to: "us-risk-service" },
    { from: "us-payment-api", to: "us-ledger" },
    { from: "us-ledger", to: "us-event-publisher" },
    { from: "us-risk-service", to: "fraud-provider" },

    { from: "eu-payment-api", to: "eu-risk-service" },
    { from: "eu-payment-api", to: "eu-ledger-replica" },
    { from: "eu-ledger-replica", to: "eu-event-publisher" },
    { from: "eu-risk-service", to: "fraud-provider" },

    // Cross-region ledger replication.
    { from: "us-ledger", to: "eu-ledger-replica" },

    // Both regions feed the shared settlement pipeline.
    { from: "us-event-publisher", to: "settlement-pipeline" },
    { from: "eu-event-publisher", to: "settlement-pipeline" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "global-traffic-manager": "healthy",
  "us-payment-api": "healthy",
  "us-risk-service": "healthy",
  "us-ledger": "healthy",
  "us-event-publisher": "healthy",
  "eu-payment-api": "healthy",
  "eu-risk-service": "healthy",
  "eu-ledger-replica": "healthy",
  "eu-event-publisher": "healthy",
  "fraud-provider": "healthy",
  "settlement-pipeline": "healthy",
};
