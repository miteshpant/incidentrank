import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "producer-service", label: "Producer Service" },
    { id: "job-queue", label: "Job Queue" },
    { id: "worker-pool", label: "Worker Pool" },
    { id: "notification-api", label: "Notification API" },
  ],
  edges: [
    { from: "producer-service", to: "job-queue" },
    { from: "job-queue", to: "worker-pool" },
    { from: "worker-pool", to: "notification-api" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "job-queue": "healthy",
  "worker-pool": "healthy",
  "notification-api": "healthy",
};
