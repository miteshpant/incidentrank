import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "client", label: "Client" },
    { id: "gateway", label: "Gateway" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "dependency", label: "Dependency" },
  ],
  edges: [
    { from: "client", to: "gateway" },
    { from: "gateway", to: "service-a" },
    { from: "service-a", to: "service-b" },
    { from: "service-b", to: "dependency" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  dependency: "healthy",
};
