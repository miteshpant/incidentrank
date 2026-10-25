import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "node-a", label: "Node A" },
    { id: "node-b", label: "Node B" },
    { id: "node-c", label: "Node C" },
    { id: "node-d", label: "Node D" },
    { id: "node-e", label: "Node E" },
    { id: "consensus-group", label: "Consensus Group" },
  ],
  edges: [
    { from: "node-a", to: "consensus-group" },
    { from: "node-b", to: "consensus-group" },
    { from: "node-c", to: "consensus-group" },
    { from: "node-d", to: "consensus-group" },
    { from: "node-e", to: "consensus-group" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "node-a": "healthy",
  "node-b": "healthy",
  "node-c": "healthy",
  "node-d": "healthy",
  "node-e": "healthy",
  "consensus-group": "healthy",
};
