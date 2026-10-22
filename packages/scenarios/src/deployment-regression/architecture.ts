import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "deploy-pipeline", label: "Deploy Pipeline" },
    { id: "app-service", label: "App Service" },
    { id: "database", label: "Database" },
    { id: "previous-version", label: "Previous Version" },
  ],
  edges: [
    { from: "deploy-pipeline", to: "app-service" },
    { from: "app-service", to: "database" },
    { from: "deploy-pipeline", to: "previous-version" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "app-service": "healthy",
  database: "healthy",
  "previous-version": "healthy",
};
