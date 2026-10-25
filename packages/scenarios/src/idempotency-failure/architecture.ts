import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "request-source", label: "Request Source" },
    { id: "service-a", label: "Service A" },
    { id: "queue-worker", label: "Queue / Worker" },
    { id: "idempotency-store", label: "Idempotency Store" },
    { id: "external-side-effect", label: "External Side Effect" },
  ],
  edges: [
    { from: "request-source", to: "service-a" },
    { from: "service-a", to: "queue-worker" },
    { from: "queue-worker", to: "idempotency-store" },
    { from: "queue-worker", to: "external-side-effect" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "request-source": "healthy",
  "service-a": "healthy",
  "queue-worker": "healthy",
  "idempotency-store": "healthy",
  "external-side-effect": "healthy",
};
