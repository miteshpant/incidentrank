import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "api-fleet", label: "API Fleet" },
    { id: "database", label: "Database" },
    { id: "cache", label: "Cache" },
  ],
  edges: [
    { from: "clients", to: "load-balancer" },
    { from: "load-balancer", to: "api-fleet" },
    { from: "api-fleet", to: "database" },
    { from: "api-fleet", to: "cache" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "api-fleet": "healthy",
  database: "healthy",
  cache: "healthy",
};
