import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 11 flat nodes — Clients, API, Shard Router, and four shard pairs
 * (Primary + Replica each). Flat ArchitectureNode/ArchitectureEdge
 * representation per phase6d.2.md section 7 — no region/shard-group
 * containers. Every shard pair is structurally identical (same edge
 * shape primary->replica), which is exactly what makes it readable at
 * 11 nodes: the candidate only needs to understand ONE repeated unit
 * (a primary feeding a replica, both reachable via the shard router)
 * and then observe which ONE of the four instances of that unit is
 * unhealthy. Node count/edge count reported in the completion report;
 * this is not a flat-architecture failure case.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "shard-router", label: "Shard Router" },
    { id: "shard1-primary", label: "Shard 1 Primary" },
    { id: "shard1-replica", label: "Shard 1 Replica" },
    { id: "shard2-primary", label: "Shard 2 Primary" },
    { id: "shard2-replica", label: "Shard 2 Replica" },
    { id: "shard3-primary", label: "Shard 3 Primary" },
    { id: "shard3-replica", label: "Shard 3 Replica" },
    { id: "shard4-primary", label: "Shard 4 Primary" },
    { id: "shard4-replica", label: "Shard 4 Replica" },
  ],
  edges: [
    { from: "clients", to: "api" },
    { from: "api", to: "shard-router" },
    { from: "shard-router", to: "shard1-primary" },
    { from: "shard1-primary", to: "shard1-replica" },
    { from: "shard-router", to: "shard2-primary" },
    { from: "shard2-primary", to: "shard2-replica" },
    { from: "shard-router", to: "shard3-primary" },
    { from: "shard3-primary", to: "shard3-replica" },
    { from: "shard-router", to: "shard4-primary" },
    { from: "shard4-primary", to: "shard4-replica" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "shard-router": "healthy",
  "shard1-primary": "healthy",
  "shard1-replica": "healthy",
  "shard2-primary": "healthy",
  "shard2-replica": "healthy",
  "shard3-primary": "healthy",
  "shard3-replica": "healthy",
  "shard4-primary": "healthy",
  "shard4-replica": "healthy",
};
