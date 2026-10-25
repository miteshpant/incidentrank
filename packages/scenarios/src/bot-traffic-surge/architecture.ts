import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "internet-traffic", label: "Internet Traffic" },
    { id: "edge-gateway", label: "Edge / Gateway" },
    { id: "api", label: "API" },
    { id: "core-services", label: "Core Services" },
  ],
  edges: [
    { from: "internet-traffic", to: "edge-gateway" },
    { from: "edge-gateway", to: "api" },
    { from: "api", to: "core-services" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "internet-traffic": "healthy",
  "edge-gateway": "healthy",
  api: "healthy",
  "core-services": "healthy",
};
