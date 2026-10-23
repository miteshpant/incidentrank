import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producers", label: "Producers" },
    { id: "event-stream", label: "Partitioned Event Stream" },
    { id: "consumers", label: "Stateful Consumers" },
    { id: "materialized-state", label: "Materialized State" },
  ],
  edges: [
    { from: "producers", to: "event-stream" },
    { from: "event-stream", to: "consumers" },
    { from: "consumers", to: "materialized-state" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-stream": "healthy",
  consumers: "healthy",
  "materialized-state": "healthy",
};
