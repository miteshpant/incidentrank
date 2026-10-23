import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "region-a", label: "Region A" },
    { id: "coordinator", label: "Distributed Coordinator" },
    { id: "region-b", label: "Region B" },
  ],
  edges: [
    { from: "region-a", to: "coordinator" },
    { from: "coordinator", to: "region-b" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "region-a": "healthy",
  coordinator: "healthy",
  "region-b": "healthy",
};
