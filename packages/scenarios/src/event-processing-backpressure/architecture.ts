import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "event-producers", label: "Event Producers" },
    { id: "kafka", label: "Kafka" },
    { id: "processing-layer", label: "Processing Layer" },
    { id: "database", label: "Database" },
    { id: "external-api", label: "External API" },
  ],
  edges: [
    { from: "event-producers", to: "kafka" },
    { from: "kafka", to: "processing-layer" },
    { from: "processing-layer", to: "database" },
    { from: "processing-layer", to: "external-api" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "event-producers": "healthy",
  kafka: "healthy",
  "processing-layer": "healthy",
  database: "healthy",
  "external-api": "healthy",
};
