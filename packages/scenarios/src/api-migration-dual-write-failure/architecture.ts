import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 8 logical nodes, flat ArchitectureNode/ArchitectureEdge representation
 * per phase6d.2.md section 7 — no region containers, no subsystem
 * groups, no nested architecture. The migration topology (one gateway
 * fanning out through a migration layer into two independent
 * service+datastore stacks that both feed a reconciliation process) is
 * fully expressible as flat nodes/edges: every edge represents a real,
 * single request/data-flow relationship, and the two service/DB pairs
 * are structurally symmetric (Legacy mirrors New), so there is no
 * grouping that would make the graph meaningfully easier to read than
 * labeling the nodes clearly already does.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "migration-layer", label: "Migration Layer" },
    { id: "legacy-service", label: "Legacy Service" },
    { id: "new-service", label: "New Service" },
    { id: "legacy-db", label: "Legacy DB" },
    { id: "new-db", label: "New DB" },
    { id: "reconciliation", label: "Reconciliation" },
  ],
  edges: [
    { from: "clients", to: "api-gateway" },
    { from: "api-gateway", to: "migration-layer" },
    { from: "migration-layer", to: "legacy-service" },
    { from: "migration-layer", to: "new-service" },
    { from: "legacy-service", to: "legacy-db" },
    { from: "new-service", to: "new-db" },
    { from: "legacy-db", to: "reconciliation" },
    { from: "new-db", to: "reconciliation" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "migration-layer": "healthy",
  "legacy-service": "healthy",
  "new-service": "healthy",
  "legacy-db": "healthy",
  "new-db": "healthy",
  reconciliation: "healthy",
};
