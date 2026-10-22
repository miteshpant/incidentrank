import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-service", label: "API Service" },
    { id: "background-jobs", label: "Background Jobs" },
    { id: "connection-pool", label: "Connection Pool" },
    { id: "primary-db", label: "Primary Database" },
    { id: "read-replica", label: "Read Replica" },
  ],
  edges: [
    { from: "api-service", to: "connection-pool" },
    { from: "background-jobs", to: "connection-pool" },
    { from: "connection-pool", to: "primary-db" },
    { from: "primary-db", to: "read-replica" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "background-jobs": "healthy",
  "connection-pool": "healthy",
  "primary-db": "healthy",
  "read-replica": "healthy",
};
