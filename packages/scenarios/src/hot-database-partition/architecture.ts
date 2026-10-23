import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api", label: "API" },
    { id: "routing-layer", label: "Routing Layer" },
    { id: "partition-a", label: "Partition A" },
    { id: "partition-b", label: "Partition B" },
    { id: "partition-c", label: "Partition C" },
    { id: "partition-d", label: "Partition D" },
  ],
  edges: [
    { from: "api", to: "routing-layer" },
    { from: "routing-layer", to: "partition-a" },
    { from: "routing-layer", to: "partition-b" },
    { from: "routing-layer", to: "partition-c" },
    { from: "routing-layer", to: "partition-d" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  "routing-layer": "healthy",
  "partition-a": "healthy",
  "partition-b": "healthy",
  "partition-c": "healthy",
  "partition-d": "healthy",
};
