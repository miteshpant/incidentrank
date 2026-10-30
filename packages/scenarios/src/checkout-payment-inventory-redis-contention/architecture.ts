import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "checkout-api", label: "Checkout API" },
    { id: "payment-api", label: "Payment API" },
    { id: "inventory-api", label: "Inventory API" },
    { id: "redis", label: "Redis" },
  ],
  edges: [
    { from: "checkout-api", to: "payment-api" },
    { from: "checkout-api", to: "inventory-api" },
    { from: "payment-api", to: "redis" },
    { from: "inventory-api", to: "redis" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "checkout-api": "healthy",
  "payment-api": "healthy",
  "inventory-api": "healthy",
  redis: "healthy",
};
