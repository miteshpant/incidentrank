import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-service", label: "API Service" },
    { id: "primary-database", label: "Primary Database" },
    { id: "batch-job-worker", label: "Batch Job Worker" },
    { id: "transaction-queue", label: "Transaction Queue" },
  ],
  edges: [
    { from: "api-service", to: "primary-database" },
    { from: "batch-job-worker", to: "primary-database" },
    { from: "primary-database", to: "transaction-queue" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "primary-database": "healthy",
  "batch-job-worker": "healthy",
  "transaction-queue": "healthy",
};
