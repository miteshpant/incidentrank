import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 nodes, 5 edges — a flat fan-in topology (no nesting, no region
 * containers): US Region, EU Region, and APAC Region each write into a
 * shared Replication Layer, which in turn fans out to both the Primary
 * Data Store and Archive/Object Storage. This is a functioning,
 * already-healthy replication system — there is no backlog, no lag, no
 * outage anywhere in this architecture. The three regional write-client
 * nodes exist so the candidate can see "three regions" as a real,
 * visible fact (per-class/per-region controls in controls.ts act on
 * this fan-in), not because any region is individually broken.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "us-region", label: "US Region" },
    { id: "eu-region", label: "EU Region" },
    { id: "apac-region", label: "APAC Region" },
    { id: "replication-layer", label: "Replication Layer" },
    { id: "primary-data-store", label: "Primary Data Store" },
    { id: "archive-object-storage", label: "Archive / Object Storage" },
  ],
  edges: [
    { from: "us-region", to: "replication-layer" },
    { from: "eu-region", to: "replication-layer" },
    { from: "apac-region", to: "replication-layer" },
    { from: "replication-layer", to: "primary-data-store" },
    { from: "replication-layer", to: "archive-object-storage" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "us-region": "healthy",
  "eu-region": "healthy",
  "apac-region": "healthy",
  "replication-layer": "healthy",
  "primary-data-store": "healthy",
  "archive-object-storage": "healthy",
};
