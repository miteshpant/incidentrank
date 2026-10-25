import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "workers", label: "Worker Fleet" },
    { id: "coordination-service", label: "Coordination Service" },
    { id: "ownership-state", label: "Shared Scheduling / Ownership State" },
  ],
  edges: [
    { from: "workers", to: "coordination-service" },
    { from: "coordination-service", to: "ownership-state" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  workers: "healthy",
  "coordination-service": "healthy",
  "ownership-state": "healthy",
};
