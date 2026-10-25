import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-api", label: "Global API" },
    { id: "us-regional-service", label: "US Regional Service" },
    { id: "eu-regional-service", label: "EU Regional Service" },
    { id: "apac-regional-service", label: "APAC Regional Service" },
    { id: "shared-dependency", label: "Shared Dependency" },
  ],
  edges: [
    { from: "global-api", to: "us-regional-service" },
    { from: "global-api", to: "eu-regional-service" },
    { from: "global-api", to: "apac-regional-service" },
    { from: "us-regional-service", to: "shared-dependency" },
    { from: "eu-regional-service", to: "shared-dependency" },
    { from: "apac-regional-service", to: "shared-dependency" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-api": "healthy",
  "us-regional-service": "healthy",
  "eu-regional-service": "healthy",
  "apac-regional-service": "healthy",
  "shared-dependency": "healthy",
};
