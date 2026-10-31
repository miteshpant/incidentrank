import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "web-frontend", label: "Web Frontend" },
    { id: "feature-flag-service", label: "Feature Flag Service" },
    { id: "checkout-service", label: "Checkout Service" },
    { id: "legacy-pricing-engine", label: "Legacy Pricing Engine" },
    { id: "pricing-cache", label: "Pricing Cache" },
  ],
  edges: [
    { from: "web-frontend", to: "checkout-service" },
    { from: "checkout-service", to: "feature-flag-service" },
    { from: "checkout-service", to: "legacy-pricing-engine" },
    { from: "legacy-pricing-engine", to: "pricing-cache" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "web-frontend": "healthy",
  "feature-flag-service": "healthy",
  "checkout-service": "healthy",
  "legacy-pricing-engine": "healthy",
  "pricing-cache": "healthy",
};
