import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "app-service", label: "App Service" },
    { id: "storage-router", label: "Storage Router" },
    { id: "storage-az-a", label: "Storage AZ-A (migration source)" },
    { id: "storage-az-b", label: "Storage AZ-B (migration target)" },
    { id: "storage-az-c", label: "Storage AZ-C (remaining healthy replica)" },
    { id: "migration-controller", label: "Migration Controller" },
  ],
  edges: [
    { from: "app-service", to: "storage-router" },
    { from: "storage-router", to: "storage-az-a" },
    { from: "storage-router", to: "storage-az-c" },
    { from: "migration-controller", to: "storage-az-a" },
    { from: "migration-controller", to: "storage-az-b" },
    { from: "migration-controller", to: "storage-az-c" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "app-service": "healthy",
  "storage-router": "healthy",
  "storage-az-a": "healthy",
  "storage-az-b": "healthy",
  "storage-az-c": "healthy",
  "migration-controller": "healthy",
};
