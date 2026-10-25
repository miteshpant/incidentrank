import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Flat architecture: a global router fronting three regions, each with
 * its own API tier, cache, and database. 10 nodes, 10 edges — within the
 * flat ArchitectureNode/ArchitectureEdge representation
 * (packages/simulator/src/types.ts), no containers/groups/new node
 * types, per phase6dsupport.md section 3. Region A is the failing
 * region; Region B and Region C are the two candidate failover targets
 * that must not be driven into a second failure.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-router", label: "Global Router" },
    { id: "region-a-api", label: "Region A API" },
    { id: "region-a-cache", label: "Region A Cache" },
    { id: "region-a-db", label: "Region A DB" },
    { id: "region-b-api", label: "Region B API" },
    { id: "region-b-cache", label: "Region B Cache" },
    { id: "region-b-db", label: "Region B DB" },
    { id: "region-c-api", label: "Region C API" },
    { id: "region-c-cache", label: "Region C Cache" },
    { id: "region-c-db", label: "Region C DB" },
  ],
  edges: [
    { from: "global-router", to: "region-a-api" },
    { from: "global-router", to: "region-b-api" },
    { from: "global-router", to: "region-c-api" },
    { from: "region-a-api", to: "region-a-cache" },
    { from: "region-a-cache", to: "region-a-db" },
    { from: "region-b-api", to: "region-b-cache" },
    { from: "region-b-cache", to: "region-b-db" },
    { from: "region-c-api", to: "region-c-cache" },
    { from: "region-c-cache", to: "region-c-db" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-router": "healthy",
  "region-a-api": "healthy",
  "region-a-cache": "healthy",
  "region-a-db": "healthy",
  "region-b-api": "healthy",
  "region-b-cache": "healthy",
  "region-b-db": "healthy",
  "region-c-api": "healthy",
  "region-c-cache": "healthy",
  "region-c-db": "healthy",
};
