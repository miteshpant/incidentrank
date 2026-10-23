import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "cache-hot-shard", label: "Cache Shard (Hot Key)" },
    { id: "cache-other-shards", label: "Cache Cluster (Other Shards)" },
    { id: "origin", label: "Origin Service" },
  ],
  edges: [
    { from: "clients", to: "api" },
    { from: "api", to: "cache-hot-shard" },
    { from: "api", to: "cache-other-shards" },
    { from: "cache-hot-shard", to: "origin" },
    { from: "cache-other-shards", to: "origin" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "cache-hot-shard": "healthy",
  "cache-other-shards": "healthy",
  origin: "healthy",
};
