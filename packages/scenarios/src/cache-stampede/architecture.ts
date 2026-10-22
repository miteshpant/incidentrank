import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-service", label: "API Service" },
    { id: "cache-layer", label: "Redis Cache" },
    { id: "origin-database", label: "Origin Database" },
    { id: "analytics-writer", label: "Analytics Writer" },
  ],
  edges: [
    { from: "api-service", to: "cache-layer" },
    { from: "cache-layer", to: "origin-database" },
    { from: "analytics-writer", to: "origin-database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "cache-layer": "healthy",
  "origin-database": "healthy",
  "analytics-writer": "healthy",
};
