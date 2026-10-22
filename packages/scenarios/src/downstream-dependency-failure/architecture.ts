import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "calling-service", label: "Calling Service" },
    { id: "downstream-service", label: "Downstream Service" },
    { id: "fallback-cache", label: "Fallback Cache" },
  ],
  edges: [
    { from: "api-gateway", to: "calling-service" },
    { from: "calling-service", to: "downstream-service" },
    { from: "calling-service", to: "fallback-cache" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "calling-service": "healthy",
  "downstream-service": "healthy",
  "fallback-cache": "healthy",
};
