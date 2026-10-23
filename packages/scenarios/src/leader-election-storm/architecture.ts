import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "node-1", label: "Cluster Node 1" },
    { id: "node-2", label: "Cluster Node 2" },
    { id: "node-3", label: "Cluster Node 3" },
    { id: "coordination-layer", label: "Consensus / Coordination Layer" },
    { id: "clients", label: "Client Services" },
  ],
  edges: [
    { from: "node-1", to: "coordination-layer" },
    { from: "node-2", to: "coordination-layer" },
    { from: "node-3", to: "coordination-layer" },
    { from: "coordination-layer", to: "clients" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "node-1": "healthy",
  "node-2": "healthy",
  "node-3": "healthy",
  "coordination-layer": "healthy",
  clients: "healthy",
};
