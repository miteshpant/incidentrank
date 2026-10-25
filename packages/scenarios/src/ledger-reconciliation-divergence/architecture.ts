import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 nodes, 5 edges — a flat linear pipeline (ArchitectureNode/
 * ArchitectureEdge per phase6d.2.md section 7; no region containers,
 * subsystem groups, or nested architecture). Deliberately linear: the
 * entire Principal-level difficulty here comes from the fact that a
 * healthy-looking chain (Transaction API -> Operational Ledger) sits
 * directly upstream of a diverging one (Event Stream -> Settlement
 * Ledger -> Reconciliation Service -> Exception/Repair Queue) with NO
 * additional topology needed to make that distinction legible — the
 * candidate has to read the values at each node, not the shape of the
 * graph, which is exactly the skill this scenario tests (see
 * definition.ts's architecture-readability note).
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "transaction-api", label: "Transaction API" },
    { id: "operational-ledger", label: "Operational Ledger" },
    { id: "event-stream", label: "Event Stream" },
    { id: "settlement-ledger", label: "Settlement Ledger" },
    { id: "reconciliation-service", label: "Reconciliation Service" },
    { id: "repair-queue", label: "Exception / Repair Queue" },
  ],
  edges: [
    { from: "transaction-api", to: "operational-ledger" },
    { from: "operational-ledger", to: "event-stream" },
    { from: "event-stream", to: "settlement-ledger" },
    { from: "settlement-ledger", to: "reconciliation-service" },
    { from: "reconciliation-service", to: "repair-queue" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "transaction-api": "healthy",
  "operational-ledger": "healthy",
  "event-stream": "healthy",
  "settlement-ledger": "healthy",
  "reconciliation-service": "healthy",
  "repair-queue": "healthy",
};
