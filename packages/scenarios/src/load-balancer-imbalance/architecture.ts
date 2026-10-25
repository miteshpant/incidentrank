import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "instance-a", label: "Instance A" },
    { id: "instance-b", label: "Instance B" },
    { id: "instance-c", label: "Instance C" },
    { id: "instance-d", label: "Instance D" },
  ],
  edges: [
    { from: "clients", to: "load-balancer" },
    { from: "load-balancer", to: "instance-a" },
    { from: "load-balancer", to: "instance-b" },
    { from: "load-balancer", to: "instance-c" },
    { from: "load-balancer", to: "instance-d" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "instance-a": "healthy",
  "instance-b": "healthy",
  "instance-c": "healthy",
  "instance-d": "healthy",
};
