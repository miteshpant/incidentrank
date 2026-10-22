import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "client-fleet", label: "Client Fleet" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-service", label: "Auth Service" },
    { id: "config-service", label: "Config Service" },
  ],
  edges: [
    { from: "client-fleet", to: "api-gateway" },
    { from: "api-gateway", to: "auth-service" },
    { from: "api-gateway", to: "config-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "client-fleet": "healthy",
  "api-gateway": "healthy",
  "auth-service": "healthy",
  "config-service": "healthy",
};
