import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "client-service", label: "Client Service" },
    { id: "token-bucket-limiter", label: "Token Bucket Limiter" },
    { id: "payment-verification-api", label: "Payment Verification API" },
    { id: "retry-queue", label: "Retry Queue" },
  ],
  edges: [
    { from: "client-service", to: "token-bucket-limiter" },
    { from: "token-bucket-limiter", to: "payment-verification-api" },
    { from: "client-service", to: "retry-queue" },
    { from: "retry-queue", to: "payment-verification-api" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "client-service": "healthy",
  "token-bucket-limiter": "healthy",
  "payment-verification-api": "healthy",
  "retry-queue": "healthy",
};
