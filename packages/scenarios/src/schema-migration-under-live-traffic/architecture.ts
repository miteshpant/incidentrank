import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 logical nodes, flat ArchitectureNode/ArchitectureEdge representation
 * per phase6d3.md section 3 — no containers, no groups, no nesting. The
 * topology (clients through a load balancer, fanning out to two app
 * fleets that share one database, with a backfill/migration worker
 * fleet operating against that same database) is fully expressible as
 * flat nodes/edges: every edge is a real, single request/data-flow
 * relationship, and there is exactly one database in this scenario
 * (unlike api-migration-dual-write-failure's two full stacks), so there
 * is no grouping that would make this graph meaningfully easier to read
 * than clear node labels already do. No Job Queue or Feature Flag
 * Service node was added — compatibilityWriteMode and migrationPhase
 * already express the relevant decisions as plain controls, and a
 * dedicated node for either would not change any readable relationship
 * in the graph.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "old-app-fleet", label: "Old App Fleet" },
    { id: "new-app-fleet", label: "New App Fleet" },
    { id: "shared-database", label: "Shared Database" },
    { id: "backfill-workers", label: "Backfill / Migration Workers" },
  ],
  edges: [
    { from: "clients", to: "load-balancer" },
    { from: "load-balancer", to: "old-app-fleet" },
    { from: "load-balancer", to: "new-app-fleet" },
    { from: "old-app-fleet", to: "shared-database" },
    { from: "new-app-fleet", to: "shared-database" },
    { from: "shared-database", to: "backfill-workers" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "old-app-fleet": "healthy",
  "new-app-fleet": "healthy",
  "shared-database": "healthy",
  "backfill-workers": "healthy",
};
