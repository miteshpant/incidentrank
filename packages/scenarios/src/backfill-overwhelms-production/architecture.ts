import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat topology (ArchitectureNode/ArchitectureEdge
 * per phase6d.4.md section 3; no groups, containers, or nesting). A
 * Read Replica node was deliberately NOT added: this scenario's entire
 * mechanism is contention for ONE shared resource — the Primary
 * Database's connection pool and row/table locks — between live OLTP
 * writes and a bulk historical backfill. A replica would only ever help
 * with READS, and this incident has no read-scaling problem anywhere in
 * it (Production Clients' reads are never the bottleneck; the backfill
 * itself is overwhelmingly WRITE work — rewriting/backfilling historical
 * rows). Adding a replica node here would dilute the single-shared-write-
 * resource judgment this scenario exists to test, and would invite an
 * unearned "just read from the replica" escape hatch that has nothing to
 * do with the actual contention. Documented per phase6d.4.md's "optional
 * Read Replica only if materially useful" instruction — it is not, here.
 *
 * Edges point the way pressure actually flows into the Primary Database
 * from both directions: Production Clients -> Application API -> Primary
 * Database (the live path), and Backfill Queue/Coordinator -> Backfill
 * Workers -> Primary Database (the batch path). Both paths terminate at
 * the same contended node, which is the entire point.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "production-clients", label: "Production Clients" },
    { id: "application-api", label: "Application API" },
    { id: "primary-database", label: "Primary Database" },
    { id: "backfill-workers", label: "Backfill Workers" },
    { id: "backfill-coordinator", label: "Backfill Queue / Coordinator" },
  ],
  edges: [
    { from: "production-clients", to: "application-api" },
    { from: "application-api", to: "primary-database" },
    { from: "backfill-coordinator", to: "backfill-workers" },
    { from: "backfill-workers", to: "primary-database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "production-clients": "healthy",
  "application-api": "healthy",
  "primary-database": "healthy",
  "backfill-workers": "healthy",
  "backfill-coordinator": "healthy",
};
