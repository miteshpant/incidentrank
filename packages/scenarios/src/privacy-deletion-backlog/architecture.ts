import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 nodes, 5 edges — a flat pipeline with a fan-out (ArchitectureNode/
 * ArchitectureEdge, no groups/containers/nesting), per the brief's
 * suggested topology: Deletion Requests -> Privacy API -> Workflow
 * Queue -> {Product Databases, Analytics Store, Backup Index} (Workflow
 * Queue fans out to all three downstream stores). As flat and small as
 * Data Retention Policy Misconfiguration's 5-node linear pipeline — the
 * Senior-Staff difficulty here comes entirely from EXECUTION
 * COMPLETENESS (did a correctly-accepted deletion request actually
 * finish everywhere it needs to) riding on top of this architecture, not
 * from the shape of the graph. Which downstream store a given backlog of
 * requests has/hasn't reached is modeled as state/control on these same
 * five nodes — never a forked per-store subgraph.
 *
 * ROOT-CAUSE PLACEMENT: Deletion Requests arrive and the Privacy API
 * accepts them successfully (acceptance never fails in this scenario —
 * there is no availability incident at the front door). The real problem
 * lives in the Workflow Queue: execution against the three downstream
 * stores it fans out to falls behind, and worse, a request can be marked
 * "complete" before every required downstream store has actually
 * finished — a false-complete state that looks indistinguishable from a
 * real completion on every dashboard that only watches the acceptance
 * rate. Product Databases, Analytics Store, and Backup Index are where
 * the actual (in)completeness lives.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "deletion-requests", label: "Deletion Requests" },
    { id: "privacy-api", label: "Privacy API" },
    { id: "workflow-queue", label: "Workflow Queue" },
    { id: "product-databases", label: "Product Databases" },
    { id: "analytics-store", label: "Analytics Store" },
    { id: "backup-index", label: "Backup Index" },
  ],
  edges: [
    { from: "deletion-requests", to: "privacy-api" },
    { from: "privacy-api", to: "workflow-queue" },
    { from: "workflow-queue", to: "product-databases" },
    { from: "workflow-queue", to: "analytics-store" },
    { from: "workflow-queue", to: "backup-index" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "deletion-requests": "healthy",
  "privacy-api": "healthy",
  "workflow-queue": "healthy",
  "product-databases": "healthy",
  "analytics-store": "healthy",
  "backup-index": "healthy",
};
