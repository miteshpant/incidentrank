import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "checkout", label: "Checkout" },
    { id: "order-service", label: "Order Service" },
    { id: "postgresql", label: "PostgreSQL" },
    { id: "inventory-service", label: "Inventory Service" },
  ],
  edges: [
    { from: "checkout", to: "order-service" },
    { from: "order-service", to: "postgresql" },
    { from: "inventory-service", to: "postgresql" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  checkout: "healthy",
  "order-service": "healthy",
  postgresql: "healthy",
  "inventory-service": "healthy",
};
