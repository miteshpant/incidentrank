import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producers", label: "Producers" },
    { id: "event-gateway", label: "Event Gateway" },
    { id: "broker-cluster", label: "Broker Cluster" },
    { id: "topic-a", label: "Topic A" },
    { id: "topic-b", label: "Topic B" },
    { id: "topic-c", label: "Topic C" },
    { id: "consumer-group-a", label: "Consumer Group A" },
    { id: "consumer-group-b", label: "Consumer Group B" },
    { id: "consumer-group-c", label: "Consumer Group C" },
    { id: "downstream-systems", label: "Databases / External APIs" },
  ],
  edges: [
    { from: "producers", to: "event-gateway" },
    { from: "event-gateway", to: "broker-cluster" },
    { from: "broker-cluster", to: "topic-a" },
    { from: "broker-cluster", to: "topic-b" },
    { from: "broker-cluster", to: "topic-c" },
    { from: "topic-a", to: "consumer-group-a" },
    { from: "topic-b", to: "consumer-group-b" },
    { from: "topic-c", to: "consumer-group-c" },
    { from: "consumer-group-a", to: "downstream-systems" },
    { from: "consumer-group-b", to: "downstream-systems" },
    { from: "consumer-group-c", to: "downstream-systems" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  producers: "healthy",
  "event-gateway": "healthy",
  "broker-cluster": "healthy",
  "topic-a": "healthy",
  "topic-b": "healthy",
  "topic-c": "healthy",
  "consumer-group-a": "healthy",
  "consumer-group-b": "healthy",
  "consumer-group-c": "healthy",
  "downstream-systems": "healthy",
};
