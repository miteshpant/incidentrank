import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Flat architecture: Clients call the Search API, which forwards every
 * query to a single Query Coordinator. The Coordinator fans each query
 * out to both index clusters (sharded basic search/document retrieval),
 * to the Ranking Service (re-ranking/personalization), and to the
 * Feature Store (enrichment features the Ranking Service consumes). 7
 * nodes, 6 edges — within the flat ArchitectureNode/ArchitectureEdge
 * representation (packages/simulator/src/types.ts), no containers/
 * groups/new node types, per phase6d.2.md section 7. The Ranking Service
 * is the single degrading dependency; Index Cluster A/B and the Feature
 * Store are architecturally unrelated to each other and to Ranking —
 * they only share pressure because the Query Coordinator holds one
 * connection/request slot open across all four calls per query.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "search-api", label: "Search API" },
    { id: "query-coordinator", label: "Query Coordinator" },
    { id: "index-cluster-a", label: "Index Cluster A" },
    { id: "index-cluster-b", label: "Index Cluster B" },
    { id: "ranking-service", label: "Ranking Service" },
    { id: "feature-store", label: "Feature Store" },
  ],
  edges: [
    { from: "clients", to: "search-api" },
    { from: "search-api", to: "query-coordinator" },
    { from: "query-coordinator", to: "index-cluster-a" },
    { from: "query-coordinator", to: "index-cluster-b" },
    { from: "query-coordinator", to: "ranking-service" },
    { from: "query-coordinator", to: "feature-store" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "search-api": "healthy",
  "query-coordinator": "healthy",
  "index-cluster-a": "healthy",
  "index-cluster-b": "healthy",
  "ranking-service": "healthy",
  "feature-store": "healthy",
};
