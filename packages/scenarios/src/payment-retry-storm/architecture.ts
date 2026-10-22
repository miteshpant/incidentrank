import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "checkout-service", label: "Checkout Service" },
    { id: "payment-service", label: "Payment Service" },
    { id: "payment-provider", label: "External Payment Provider" },
    { id: "postgres", label: "Postgres" },
    { id: "kafka", label: "Kafka" },
    { id: "settlement-worker", label: "Settlement Worker" },
  ],
  edges: [
    { from: "api-gateway", to: "checkout-service" },
    { from: "checkout-service", to: "payment-service" },
    { from: "payment-service", to: "payment-provider" },
    { from: "payment-service", to: "postgres" },
    { from: "postgres", to: "kafka" },
    { from: "kafka", to: "settlement-worker" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "healthy",
  "payment-service": "healthy",
  "payment-provider": "healthy",
  postgres: "healthy",
  kafka: "healthy",
  "settlement-worker": "healthy",
};
