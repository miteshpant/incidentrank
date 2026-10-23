import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-cluster", label: "API Cluster" },
    { id: "distributed-cache", label: "Distributed Cache" },
    { id: "primary-database", label: "Primary Database" },
  ],
  edges: [
    { from: "api-cluster", to: "distributed-cache" },
    { from: "distributed-cache", to: "primary-database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-cluster": "healthy",
  "distributed-cache": "healthy",
  "primary-database": "healthy",
};
