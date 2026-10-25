import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat linear pipeline (ArchitectureNode/
 * ArchitectureEdge per phase6d3.md section 3; no groups, containers, or
 * nesting). Deliberately linear and small: the entire Senior-Staff
 * difficulty here comes from reading the VALUES at each node correctly
 * (Ingestion stays healthy while Stream Processor and, if mishandled,
 * Warehouse degrade) and from a tiered judgment ACROSS DATASETS within
 * the Stream-Processor/Warehouse stage, not from the shape of the graph.
 * No additional topology (no per-dataset nodes, no separate Tier-1/
 * Tier-2 pipelines) is needed to make the distinction legible — dataset
 * tiering is modeled as state/control, not as architecture, exactly the
 * way Ledger Reconciliation Divergence models "which ledger" as state
 * rather than forking the graph per ledger.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "source-systems", label: "Source Systems" },
    { id: "ingestion", label: "Ingestion" },
    { id: "stream-processor", label: "Stream Processor" },
    { id: "warehouse", label: "Warehouse" },
    { id: "serving-layer", label: "Serving Layer / Reports" },
  ],
  edges: [
    { from: "source-systems", to: "ingestion" },
    { from: "ingestion", to: "stream-processor" },
    { from: "stream-processor", to: "warehouse" },
    { from: "warehouse", to: "serving-layer" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "source-systems": "healthy",
  ingestion: "healthy",
  "stream-processor": "healthy",
  warehouse: "healthy",
  "serving-layer": "healthy",
};
