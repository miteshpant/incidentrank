import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "event-source", label: "Event Source" },
    { id: "webhook-dispatcher", label: "Webhook Dispatcher" },
    { id: "affected-destinations", label: "Affected Customer Endpoints" },
    { id: "healthy-destinations", label: "Healthy Customer Endpoints" },
  ],
  edges: [
    { from: "event-source", to: "webhook-dispatcher" },
    { from: "webhook-dispatcher", to: "affected-destinations" },
    { from: "webhook-dispatcher", to: "healthy-destinations" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "event-source": "healthy",
  "webhook-dispatcher": "healthy",
  "affected-destinations": "healthy",
  "healthy-destinations": "healthy",
};
