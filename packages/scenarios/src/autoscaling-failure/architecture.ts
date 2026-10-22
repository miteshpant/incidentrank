import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "load-balancer", label: "Load Balancer" },
    { id: "autoscaler-controller", label: "Autoscaler Controller" },
    { id: "autoscaling-group", label: "Autoscaling Group" },
    { id: "backend-service", label: "Backend Service" },
    { id: "database", label: "Database" },
  ],
  edges: [
    { from: "load-balancer", to: "autoscaling-group" },
    { from: "autoscaler-controller", to: "autoscaling-group" },
    { from: "autoscaling-group", to: "backend-service" },
    { from: "backend-service", to: "database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "load-balancer": "healthy",
  "autoscaler-controller": "healthy",
  "autoscaling-group": "healthy",
  "backend-service": "healthy",
  database: "healthy",
};
