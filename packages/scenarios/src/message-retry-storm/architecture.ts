import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producer-service", label: "Producer Service" },
    { id: "message-broker", label: "Message Broker" },
    { id: "worker-pool", label: "Worker Pool" },
    { id: "downstream-dependency", label: "Downstream Dependency" },
    { id: "dead-letter-queue", label: "Dead Letter Queue" },
  ],
  edges: [
    { from: "producer-service", to: "message-broker" },
    { from: "message-broker", to: "worker-pool" },
    { from: "worker-pool", to: "downstream-dependency" },
    { from: "worker-pool", to: "dead-letter-queue" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "message-broker": "healthy",
  "worker-pool": "healthy",
  "downstream-dependency": "healthy",
  "dead-letter-queue": "healthy",
};
