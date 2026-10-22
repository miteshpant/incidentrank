import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "config-service", label: "Config Service" },
    { id: "api-service", label: "API Service" },
    { id: "backend-service", label: "Backend Service" },
    { id: "client", label: "Client" },
  ],
  edges: [
    { from: "config-service", to: "api-service" },
    { from: "client", to: "api-service" },
    { from: "api-service", to: "backend-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "config-service": "healthy",
  "api-service": "healthy",
  "backend-service": "healthy",
  client: "healthy",
};
