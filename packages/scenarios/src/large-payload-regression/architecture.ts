import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "gateway", label: "Gateway" },
    { id: "api-service", label: "API Service" },
    { id: "storage", label: "Storage / Database" },
  ],
  edges: [
    { from: "clients", to: "gateway" },
    { from: "gateway", to: "api-service" },
    { from: "api-service", to: "storage" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "healthy",
  "api-service": "healthy",
  storage: "healthy",
};
