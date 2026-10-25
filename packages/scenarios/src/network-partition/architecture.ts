import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "region-a", label: "Region A" },
    { id: "replicated-service", label: "Replicated Service" },
    { id: "region-b", label: "Region B" },
  ],
  edges: [
    { from: "region-a", to: "replicated-service" },
    { from: "replicated-service", to: "region-b" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "region-a": "healthy",
  "replicated-service": "healthy",
  "region-b": "healthy",
};
