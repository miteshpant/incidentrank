import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "workers", label: "Worker Fleet" },
    { id: "lock-service", label: "Distributed Lock Service" },
    { id: "shared-resource", label: "Shared Resource" },
  ],
  edges: [
    { from: "workers", to: "lock-service" },
    { from: "lock-service", to: "shared-resource" },
    { from: "workers", to: "shared-resource" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  workers: "healthy",
  "lock-service": "healthy",
  "shared-resource": "healthy",
};
