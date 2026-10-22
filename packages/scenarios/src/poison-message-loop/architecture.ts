import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producer-service", label: "Producer Service" },
    { id: "message-queue", label: "Message Queue" },
    { id: "consumer-worker", label: "Consumer Worker" },
    { id: "processing-service", label: "Processing Service" },
    { id: "dead-letter-queue", label: "Dead Letter Queue" },
  ],
  edges: [
    { from: "producer-service", to: "message-queue" },
    { from: "message-queue", to: "consumer-worker" },
    { from: "consumer-worker", to: "processing-service" },
    { from: "consumer-worker", to: "dead-letter-queue" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-queue": "healthy",
  "consumer-worker": "healthy",
  "processing-service": "healthy",
  "dead-letter-queue": "healthy",
};
