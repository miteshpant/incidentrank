import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "application-services", label: "Application Services" },
    { id: "db-proxy", label: "DB Proxy" },
    { id: "primary", label: "Primary" },
    { id: "replica", label: "Replica" },
  ],
  edges: [
    { from: "application-services", to: "db-proxy" },
    { from: "db-proxy", to: "primary" },
    { from: "db-proxy", to: "replica" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "application-services": "healthy",
  "db-proxy": "healthy",
  primary: "healthy",
  replica: "healthy",
};
