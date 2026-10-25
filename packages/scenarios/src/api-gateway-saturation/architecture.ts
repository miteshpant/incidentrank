import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "service-fleet", label: "Service Fleet" },
  ],
  edges: [
    { from: "clients", to: "api-gateway" },
    { from: "api-gateway", to: "service-fleet" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "service-fleet": "healthy",
};
