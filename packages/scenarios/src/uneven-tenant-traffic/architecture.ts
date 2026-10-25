import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Tenant Clients" },
    { id: "multi-tenant-api", label: "Multi-Tenant API" },
    { id: "shared-service-fleet", label: "Shared Service Fleet" },
    { id: "shared-data-layer", label: "Shared Data Layer" },
  ],
  edges: [
    { from: "clients", to: "multi-tenant-api" },
    { from: "multi-tenant-api", to: "shared-service-fleet" },
    { from: "shared-service-fleet", to: "shared-data-layer" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "multi-tenant-api": "healthy",
  "shared-service-fleet": "healthy",
  "shared-data-layer": "healthy",
};
