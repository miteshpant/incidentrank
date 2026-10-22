import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "checkout-service", label: "Checkout Service" },
    { id: "order-service", label: "Order Service" },
    { id: "user-profile-service", label: "User Profile Service" },
    { id: "profile-database", label: "Profile Database" },
  ],
  edges: [
    { from: "api-gateway", to: "checkout-service" },
    { from: "checkout-service", to: "order-service" },
    { from: "order-service", to: "user-profile-service" },
    { from: "user-profile-service", to: "profile-database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "healthy",
  "order-service": "healthy",
  "user-profile-service": "healthy",
  "profile-database": "healthy",
};
