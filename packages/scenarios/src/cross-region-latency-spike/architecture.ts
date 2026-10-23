import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "us-region", label: "US Region" },
    { id: "global-services", label: "Global Services" },
    { id: "eu-region", label: "EU Region" },
  ],
  edges: [
    { from: "us-region", to: "global-services" },
    { from: "eu-region", to: "global-services" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "us-region": "healthy",
  "global-services": "healthy",
  "eu-region": "healthy",
};
