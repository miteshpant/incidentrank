import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api-service", label: "API Service" },
    { id: "orders-service", label: "Orders Service" },
    { id: "postgresql-primary", label: "PostgreSQL Primary" },
  ],
  edges: [
    { from: "clients", to: "api-service" },
    { from: "api-service", to: "orders-service" },
    { from: "orders-service", to: "postgresql-primary" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-service": "healthy",
  "orders-service": "healthy",
  "postgresql-primary": "healthy",
};
