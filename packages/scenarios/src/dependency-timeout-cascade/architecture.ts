import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "client", label: "Client" },
    { id: "api", label: "API" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
  ],
  edges: [
    { from: "client", to: "api" },
    { from: "api", to: "service-a" },
    { from: "service-a", to: "service-b" },
    { from: "service-b", to: "service-c" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
};
