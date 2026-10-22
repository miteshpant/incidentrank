import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producer-service", label: "Producer Service" },
    { id: "kafka-topic", label: "Kafka Topic" },
    { id: "hot-partition", label: "Hot Partition" },
    { id: "consumer-group", label: "Consumer Group" },
    { id: "downstream-processor", label: "Downstream Processor" },
  ],
  edges: [
    { from: "producer-service", to: "kafka-topic" },
    { from: "kafka-topic", to: "hot-partition" },
    { from: "hot-partition", to: "consumer-group" },
    { from: "consumer-group", to: "downstream-processor" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "healthy",
  "hot-partition": "healthy",
  "consumer-group": "healthy",
  "downstream-processor": "healthy",
};
