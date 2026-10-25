import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api-fleet", label: "API Fleet" },
    { id: "shared-cache", label: "Shared Cache" },
    { id: "origin", label: "Origin / Catalog Service" },
  ],
  edges: [
    { from: "clients", to: "api-fleet" },
    { from: "api-fleet", to: "shared-cache" },
    { from: "shared-cache", to: "origin" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-fleet": "healthy",
  "shared-cache": "healthy",
  origin: "healthy",
};
