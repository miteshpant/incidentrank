import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
    { id: "service-registry", label: "Service Registry" },
  ],
  edges: [
    { from: "api-gateway", to: "service-a" },
    { from: "service-a", to: "service-b" },
    { from: "service-a", to: "service-c" },
    { from: "service-c", to: "service-registry" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-registry": "healthy",
};
