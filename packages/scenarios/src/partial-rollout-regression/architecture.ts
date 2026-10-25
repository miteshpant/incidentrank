import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "traffic", label: "Traffic" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "old-version", label: "Old Version" },
    { id: "new-version", label: "New Version" },
    { id: "shared-dependency", label: "Shared Dependency" },
  ],
  edges: [
    { from: "traffic", to: "load-balancer" },
    { from: "load-balancer", to: "old-version" },
    { from: "load-balancer", to: "new-version" },
    { from: "old-version", to: "shared-dependency" },
    { from: "new-version", to: "shared-dependency" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  traffic: "healthy",
  "load-balancer": "healthy",
  "old-version": "healthy",
  "new-version": "healthy",
  "shared-dependency": "healthy",
};
