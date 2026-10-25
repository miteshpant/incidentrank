import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-router", label: "Global Router" },
    { id: "service-fleet", label: "Service Fleet" },
    { id: "multi-az-capacity", label: "Multi-AZ Capacity" },
    { id: "database-primary", label: "Database Primary" },
    { id: "read-replicas", label: "Read Replicas" },
  ],
  edges: [
    { from: "global-router", to: "service-fleet" },
    { from: "service-fleet", to: "multi-az-capacity" },
    { from: "multi-az-capacity", to: "database-primary" },
    { from: "database-primary", to: "read-replicas" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-router": "healthy",
  "service-fleet": "healthy",
  "multi-az-capacity": "healthy",
  "database-primary": "healthy",
  "read-replicas": "healthy",
};
