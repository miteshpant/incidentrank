import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 5 edges — a flat serving fan-out (ArchitectureNode/
 * ArchitectureEdge per phase6e3.md; no groups, containers, or nesting).
 * Requests arrive at the Routing Layer, which decides — per request —
 * whether to serve from the Large Model or the Small Model; both models
 * read features from the same shared Feature Store. This mirrors the
 * brief's suggested topology exactly: "Requests -> Routing Layer ->
 * Large Model, Small Model -> Feature Store."
 *
 * ROOT-CAUSE PLACEMENT: the incident originates at the Routing Layer — a
 * request-complexity classifier it depends on to decide "is this simple
 * enough for the Small Model" has degraded (drifted/misconfigured), so
 * the Routing Layer defaults toward the Large Model far more often than
 * genuinely necessary. This is a COST problem wearing a routing-decision
 * disguise, not a capacity problem: Large Model and Small Model
 * themselves are never overloaded, never degraded, never slow anywhere
 * in this scenario — nothing here fails a request. The entire
 * Principal-level judgment is in correctly reading inference cost and
 * decision-quality signals that never show up as an availability
 * incident at all.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "requests", label: "Requests" },
    { id: "routing-layer", label: "Routing Layer" },
    { id: "large-model", label: "Large Model" },
    { id: "small-model", label: "Small Model" },
    { id: "feature-store", label: "Feature Store" },
  ],
  edges: [
    { from: "requests", to: "routing-layer" },
    { from: "routing-layer", to: "large-model" },
    { from: "routing-layer", to: "small-model" },
    { from: "large-model", to: "feature-store" },
    { from: "small-model", to: "feature-store" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  requests: "healthy",
  "routing-layer": "healthy",
  "large-model": "healthy",
  "small-model": "healthy",
  "feature-store": "healthy",
};
