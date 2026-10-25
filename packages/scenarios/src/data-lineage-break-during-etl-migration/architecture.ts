import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 nodes, 6 edges — a flat migration topology (ArchitectureNode/
 * ArchitectureEdge per phase6e3.md; no groups, containers, or nesting).
 * ETL v1 and ETL v2 are modeled as SEPARATE, PARALLEL nodes (both
 * feeding the same Warehouse) because the entire incident is about two
 * concurrently-live computation paths producing data that must never be
 * silently blended within one computed value — collapsing them into one
 * "ETL" node would hide the exact thing this scenario tests. Everything
 * else is deliberately flat and small: the Principal-level difficulty
 * comes from correctly reading a LINEAGE/TRUST judgment axis layered on
 * top of a fully "available" system, not from architectural complexity.
 *
 * ROOT-CAUSE PLACEMENT: the incident originates in the migration cutover
 * itself (ETL v1 -> ETL v2), not in any node failing. Sources, Warehouse,
 * Metrics Layer, and Reports all stay structurally healthy and available
 * throughout — nothing here ever fails a request or goes down. The risk
 * is entirely about WHICH computation path (v1, v2, or an inconsistent
 * mix of both) produced the numbers currently flowing into the Metrics
 * Layer and out to Reports, and whether that is tracked/flagged honestly.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "sources", label: "Sources" },
    { id: "etl-v1", label: "ETL v1" },
    { id: "etl-v2", label: "ETL v2" },
    { id: "warehouse", label: "Warehouse" },
    { id: "metrics-layer", label: "Metrics Layer" },
    { id: "reports", label: "Reports" },
  ],
  edges: [
    { from: "sources", to: "etl-v1" },
    { from: "sources", to: "etl-v2" },
    { from: "etl-v1", to: "warehouse" },
    { from: "etl-v2", to: "warehouse" },
    { from: "warehouse", to: "metrics-layer" },
    { from: "metrics-layer", to: "reports" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  sources: "healthy",
  "etl-v1": "healthy",
  "etl-v2": "healthy",
  warehouse: "healthy",
  "metrics-layer": "healthy",
  reports: "healthy",
};
