import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "client", label: "Client" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "service", label: "Order Service" },
    { id: "database", label: "Database / Side Effect" },
  ],
  edges: [
    { from: "client", to: "api-gateway" },
    { from: "api-gateway", to: "service" },
    { from: "service", to: "database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  "api-gateway": "healthy",
  service: "healthy",
  database: "healthy",
};
