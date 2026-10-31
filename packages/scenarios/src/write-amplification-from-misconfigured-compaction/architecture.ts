import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "write-api", label: "Write API" },
    { id: "storage-engine", label: "Storage Engine (LSM Compaction)" },
    { id: "disk-iops", label: "Block Storage (Disk IOPS)" },
    { id: "config-service", label: "Storage Config Service" },
  ],
  edges: [
    { from: "write-api", to: "storage-engine" },
    { from: "storage-engine", to: "disk-iops" },
    { from: "config-service", to: "storage-engine" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "write-api": "healthy",
  "storage-engine": "healthy",
  "disk-iops": "healthy",
  "config-service": "healthy",
};
