import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "internal-web-app", label: "Internal Web App" },
    { id: "partner-api-gateway", label: "Partner API Gateway" },
    { id: "cors-policy-enforcer", label: "CORS Policy Enforcer" },
    { id: "partner-integration-service", label: "Partner Integration Service" },
  ],
  edges: [
    { from: "internal-web-app", to: "partner-api-gateway" },
    { from: "partner-api-gateway", to: "cors-policy-enforcer" },
    { from: "cors-policy-enforcer", to: "partner-integration-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "internal-web-app": "healthy",
  "partner-api-gateway": "healthy",
  "cors-policy-enforcer": "healthy",
  "partner-integration-service": "healthy",
};
