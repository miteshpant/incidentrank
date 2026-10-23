import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "events", label: "Events" },
    { id: "consumer", label: "Consumer" },
    { id: "main-processing", label: "Main Processing" },
    { id: "dlq", label: "Dead-Letter Queue" },
    { id: "reprocessor", label: "Reprocessor" },
  ],
  edges: [
    { from: "events", to: "consumer" },
    { from: "consumer", to: "main-processing" },
    { from: "consumer", to: "dlq" },
    { from: "dlq", to: "reprocessor" },
    { from: "reprocessor", to: "main-processing" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  events: "healthy",
  consumer: "healthy",
  "main-processing": "healthy",
  dlq: "healthy",
  reprocessor: "healthy",
};
