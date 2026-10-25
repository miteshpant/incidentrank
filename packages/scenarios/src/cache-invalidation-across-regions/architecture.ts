import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 6 nodes, 9 edges — a flat fan-out/fan-in topology (ArchitectureNode/
 * ArchitectureEdge per phase6d3.md section 3; no region containers, no
 * nesting). Global API fans out to three regional caches, each of
 * which falls through to the shared Origin Store on a miss; the
 * Invalidation Stream / Publisher feeds invalidation messages to all
 * three regional caches independently. The three-cache fan-out is
 * exactly the shape the candidate must read correctly: all three nodes
 * are visibly parallel siblings under Global API and visibly parallel
 * recipients of the one Invalidation Stream node — the architecture
 * itself establishes "three regions, one shared stream, one shared
 * origin" without needing any grouping/nesting construct. Each cache
 * node's own per-region health (set per rule in rules.ts) is what
 * tells the candidate WHICH region is delayed/duplicated/healthy, not
 * the topology shape.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-api", label: "Global API" },
    { id: "us-cache", label: "US Cache" },
    { id: "eu-cache", label: "EU Cache" },
    { id: "apac-cache", label: "APAC Cache" },
    { id: "origin-store", label: "Origin Store" },
    { id: "invalidation-stream", label: "Invalidation Stream / Publisher" },
  ],
  edges: [
    { from: "global-api", to: "us-cache" },
    { from: "global-api", to: "eu-cache" },
    { from: "global-api", to: "apac-cache" },
    { from: "us-cache", to: "origin-store" },
    { from: "eu-cache", to: "origin-store" },
    { from: "apac-cache", to: "origin-store" },
    { from: "invalidation-stream", to: "us-cache" },
    { from: "invalidation-stream", to: "eu-cache" },
    { from: "invalidation-stream", to: "apac-cache" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-api": "healthy",
  "us-cache": "healthy",
  "eu-cache": "healthy",
  "apac-cache": "healthy",
  "origin-store": "healthy",
  "invalidation-stream": "healthy",
};
