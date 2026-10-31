import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "load-balancer", label: "Load Balancer" },
    { id: "app-server-pool", label: "App Server Pool" },
    { id: "session-cache", label: "Session Cache Cluster" },
    { id: "auth-service", label: "Auth Service" },
  ],
  edges: [
    { from: "load-balancer", to: "app-server-pool" },
    { from: "app-server-pool", to: "session-cache" },
    { from: "app-server-pool", to: "auth-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "app-server-pool": "healthy",
  "session-cache": "healthy",
  "auth-service": "healthy",
};
