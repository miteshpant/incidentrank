import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-service", label: "API Service" },
    { id: "query-planner", label: "Query Planner" },
    { id: "primary-database", label: "Primary Database" },
    { id: "stats-collector", label: "Statistics Collector" },
  ],
  edges: [
    { from: "api-service", to: "query-planner" },
    { from: "query-planner", to: "primary-database" },
    { from: "stats-collector", to: "primary-database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "query-planner": "healthy",
  "primary-database": "healthy",
  "stats-collector": "healthy",
};
