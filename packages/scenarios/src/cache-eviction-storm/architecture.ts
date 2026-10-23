import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api", label: "API" },
    { id: "cache", label: "Cache" },
    { id: "database", label: "Database" },
  ],
  edges: [
    { from: "api", to: "cache" },
    { from: "cache", to: "database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  cache: "healthy",
  database: "healthy",
};
