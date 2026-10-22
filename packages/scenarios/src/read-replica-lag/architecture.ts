import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "write-service", label: "Write Service" },
    { id: "primary-database", label: "Primary Database" },
    { id: "read-replica", label: "Read Replica" },
    { id: "read-service", label: "Read Service" },
    { id: "reporting-job", label: "Reporting Job" },
  ],
  edges: [
    { from: "write-service", to: "primary-database" },
    { from: "primary-database", to: "read-replica" },
    { from: "read-replica", to: "read-service" },
    { from: "read-replica", to: "reporting-job" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "write-service": "healthy",
  "primary-database": "healthy",
  "read-replica": "healthy",
  "read-service": "healthy",
  "reporting-job": "healthy",
};
