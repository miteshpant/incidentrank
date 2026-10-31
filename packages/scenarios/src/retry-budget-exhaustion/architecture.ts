import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "recommendation-service", label: "Recommendation Service" },
    { id: "pricing-service", label: "Pricing Service" },
  ],
  edges: [{ from: "recommendation-service", to: "pricing-service" }],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "recommendation-service": "healthy",
  "pricing-service": "healthy",
};
