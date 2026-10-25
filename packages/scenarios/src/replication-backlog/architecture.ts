import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "write-clients", label: "Write Clients" },
    { id: "primary-database", label: "Primary Database" },
    { id: "replication-stream", label: "Replication Stream" },
    { id: "replica-fleet", label: "Replica Fleet" },
    { id: "read-clients", label: "Read Clients" },
  ],
  edges: [
    { from: "write-clients", to: "primary-database" },
    { from: "primary-database", to: "replication-stream" },
    { from: "replication-stream", to: "replica-fleet" },
    { from: "replica-fleet", to: "read-clients" },
    { from: "primary-database", to: "read-clients" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "write-clients": "healthy",
  "primary-database": "healthy",
  "replication-stream": "healthy",
  "replica-fleet": "healthy",
  "read-clients": "healthy",
};
