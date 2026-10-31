import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "orders-api-v1", label: "Orders API v1 (deprecated)" },
    { id: "orders-api-v2", label: "Orders API v2 (current)" },
    { id: "consumer-registry", label: "Consumer Registry" },
  ],
  edges: [
    { from: "api-gateway", to: "orders-api-v1" },
    { from: "api-gateway", to: "orders-api-v2" },
    { from: "consumer-registry", to: "orders-api-v1" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "orders-api-v1": "healthy",
  "orders-api-v2": "healthy",
  "consumer-registry": "healthy",
};
