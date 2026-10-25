import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "edge", label: "Edge" },
    { id: "abuse-detection", label: "Abuse Detection" },
    { id: "rate-limiter", label: "Rate Limiter" },
    { id: "identity", label: "Identity" },
    { id: "core-api", label: "Core API" },
  ],
  edges: [
    { from: "clients", to: "edge" },
    { from: "edge", to: "abuse-detection" },
    { from: "abuse-detection", to: "rate-limiter" },
    { from: "rate-limiter", to: "identity" },
    { from: "identity", to: "core-api" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  edge: "healthy",
  "abuse-detection": "healthy",
  "rate-limiter": "healthy",
  identity: "healthy",
  "core-api": "healthy",
};
