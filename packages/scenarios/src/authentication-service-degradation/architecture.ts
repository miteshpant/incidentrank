import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-service", label: "Auth Service" },
    { id: "token-cache", label: "Token Cache" },
    { id: "identity-database", label: "Identity Database" },
    { id: "protected-service", label: "Protected Service" },
  ],
  edges: [
    { from: "api-gateway", to: "auth-service" },
    { from: "auth-service", to: "token-cache" },
    { from: "auth-service", to: "identity-database" },
    { from: "api-gateway", to: "protected-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "auth-service": "healthy",
  "token-cache": "healthy",
  "identity-database": "healthy",
  "protected-service": "healthy",
};
