import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "authorization-layer", label: "Authorization Layer" },
    { id: "policy-store", label: "Policy Store" },
    { id: "resource-metadata", label: "Resource Metadata" },
    { id: "cache-distribution", label: "Cache Distribution" },
  ],
  edges: [
    { from: "clients", to: "api-gateway" },
    { from: "api-gateway", to: "authorization-layer" },
    { from: "authorization-layer", to: "policy-store" },
    { from: "authorization-layer", to: "resource-metadata" },
    { from: "authorization-layer", to: "cache-distribution" },
    { from: "policy-store", to: "cache-distribution" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "authorization-layer": "healthy",
  "policy-store": "healthy",
  "resource-metadata": "healthy",
  "cache-distribution": "healthy",
};
