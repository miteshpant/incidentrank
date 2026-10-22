import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api-service", label: "API Service" },
    { id: "request-handler", label: "Request Handler" },
    { id: "in-memory-cache", label: "In-Memory Cache" },
    { id: "process-supervisor", label: "Process Supervisor" },
    { id: "downstream-database", label: "Downstream Database" },
  ],
  edges: [
    { from: "api-service", to: "request-handler" },
    { from: "request-handler", to: "in-memory-cache" },
    { from: "request-handler", to: "downstream-database" },
    { from: "process-supervisor", to: "api-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "request-handler": "healthy",
  "in-memory-cache": "healthy",
  "process-supervisor": "healthy",
  "downstream-database": "healthy",
};
