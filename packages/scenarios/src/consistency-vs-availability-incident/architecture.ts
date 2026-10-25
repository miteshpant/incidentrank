import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "data-service", label: "Distributed Data Service" },
    { id: "region-a", label: "Region A" },
    { id: "region-b", label: "Region B" },
  ],
  edges: [
    { from: "clients", to: "data-service" },
    { from: "data-service", to: "region-a" },
    { from: "data-service", to: "region-b" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "data-service": "healthy",
  "region-a": "healthy",
  "region-b": "healthy",
};
