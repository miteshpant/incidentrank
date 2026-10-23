import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-service", label: "API Service" },
    { id: "database", label: "Database" },
    { id: "persistent-storage", label: "Persistent Storage" },
  ],
  edges: [
    { from: "api-service", to: "database" },
    { from: "database", to: "persistent-storage" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  database: "healthy",
  "persistent-storage": "healthy",
};
