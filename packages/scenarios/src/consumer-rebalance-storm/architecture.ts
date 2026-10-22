import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "deploy-pipeline", label: "Deploy Pipeline" },
    { id: "health-check-service", label: "Health Check Service" },
    { id: "consumer-group", label: "Consumer Group" },
    { id: "kafka-topic", label: "Kafka Topic" },
    { id: "downstream-processor", label: "Downstream Processor" },
  ],
  edges: [
    { from: "deploy-pipeline", to: "consumer-group" },
    { from: "health-check-service", to: "consumer-group" },
    { from: "kafka-topic", to: "consumer-group" },
    { from: "consumer-group", to: "downstream-processor" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "health-check-service": "healthy",
  "consumer-group": "healthy",
  "kafka-topic": "healthy",
  "downstream-processor": "healthy",
};
