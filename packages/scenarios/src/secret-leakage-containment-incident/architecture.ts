import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "applications", label: "Applications" },
    { id: "secret-manager", label: "Secret Manager" },
    { id: "ci-cd", label: "CI/CD" },
    { id: "logging", label: "Logging" },
    { id: "external-integrations", label: "External Integrations" },
  ],
  edges: [
    { from: "applications", to: "secret-manager" },
    { from: "ci-cd", to: "secret-manager" },
    { from: "logging", to: "secret-manager" },
    { from: "applications", to: "external-integrations" },
    { from: "secret-manager", to: "external-integrations" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  applications: "healthy",
  "secret-manager": "healthy",
  "ci-cd": "healthy",
  logging: "healthy",
  "external-integrations": "healthy",
};
