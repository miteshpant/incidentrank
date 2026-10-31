import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "deploy-pipeline", label: "Deploy Pipeline" },
    { id: "api-service", label: "API Service" },
    { id: "connection-pool", label: "DB Connection Pool" },
    { id: "primary-db", label: "Primary Database" },
  ],
  edges: [
    { from: "deploy-pipeline", to: "api-service" },
    { from: "api-service", to: "connection-pool" },
    { from: "connection-pool", to: "primary-db" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "api-service": "healthy",
  "connection-pool": "healthy",
  "primary-db": "healthy",
};
