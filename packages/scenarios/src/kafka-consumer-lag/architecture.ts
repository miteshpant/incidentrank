import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producer-service", label: "Producer Service" },
    { id: "kafka-topic", label: "Kafka Topic" },
    { id: "consumer-group", label: "Consumer Group" },
    { id: "downstream-api", label: "Downstream API" },
    { id: "dead-letter-queue", label: "Dead Letter Queue" },
  ],
  edges: [
    { from: "producer-service", to: "kafka-topic" },
    { from: "kafka-topic", to: "consumer-group" },
    { from: "consumer-group", to: "downstream-api" },
    { from: "consumer-group", to: "dead-letter-queue" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "healthy",
  "consumer-group": "healthy",
  "downstream-api": "healthy",
  "dead-letter-queue": "healthy",
};
