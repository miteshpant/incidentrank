import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "checkout-service", label: "Checkout Service" },
    { id: "integration-adapter", label: "Integration Adapter" },
    { id: "response-cache", label: "Response Cache" },
    { id: "shipping-rate-api", label: "Shipping Rate API (External)" },
  ],
  edges: [
    { from: "checkout-service", to: "integration-adapter" },
    { from: "integration-adapter", to: "response-cache" },
    { from: "integration-adapter", to: "shipping-rate-api" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "checkout-service": "healthy",
  "integration-adapter": "healthy",
  "response-cache": "healthy",
  "shipping-rate-api": "healthy",
};
