import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "aggregation-service", label: "Aggregation Service" },
    { id: "third-party-dependency", label: "Third-Party Dependency" },
  ],
  edges: [
    { from: "clients", to: "api" },
    { from: "api", to: "aggregation-service" },
    { from: "aggregation-service", to: "third-party-dependency" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "aggregation-service": "healthy",
  "third-party-dependency": "healthy",
};
