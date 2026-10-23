import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producer", label: "Producer" },
    { id: "broker", label: "Broker" },
    { id: "consumers", label: "Consumers" },
    { id: "side-effects", label: "Payment/Order Side Effects" },
  ],
  edges: [
    { from: "producer", to: "broker" },
    { from: "broker", to: "consumers" },
    { from: "consumers", to: "side-effects" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  producer: "healthy",
  broker: "healthy",
  consumers: "healthy",
  "side-effects": "healthy",
};
