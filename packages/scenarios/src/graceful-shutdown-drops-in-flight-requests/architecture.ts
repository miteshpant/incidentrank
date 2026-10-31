import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "deploy-controller", label: "Deploy Controller" },
    { id: "orders-api", label: "Orders API" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "order-events-queue", label: "Order Events Queue" },
  ],
  edges: [
    { from: "deploy-controller", to: "orders-api" },
    { from: "load-balancer", to: "orders-api" },
    { from: "orders-api", to: "order-events-queue" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "deploy-controller": "healthy",
  "orders-api": "healthy",
  "load-balancer": "healthy",
  "order-events-queue": "healthy",
};
