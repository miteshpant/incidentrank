import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat linear serving path (ArchitectureNode/
 * ArchitectureEdge per phase6e2.md; no groups, containers, or nesting).
 * Deliberately linear and small, same discipline as Data Pipeline
 * Freshness Collapse's 5-node pipeline: the entire Principal-level
 * difficulty here comes from correctly reading a SECOND, independent
 * judgment axis (decision quality, driven by feature freshness) that
 * never shows up on Model Serving's own uptime/latency numbers — not
 * from the shape of the graph. No additional topology (no per-decision
 * nodes, no separate online/offline store nodes) is needed: whether a
 * decision is "critical" and whether it was made from stale features is
 * modeled as state/control on the existing nodes, exactly the way Data
 * Pipeline Freshness Collapse models "which tier" as state rather than
 * forking the graph per dataset.
 *
 * ROOT-CAUSE PLACEMENT: the incident originates in the Feature Pipeline
 * (feature computation falls behind real-time) and propagates into the
 * Feature Store (the materialized features Model Serving reads age out
 * past their intended freshness bound). Model Serving and the Decision
 * API are architecturally downstream of a freshness problem, not an
 * availability problem — this is why their own health/latency fields
 * stay green throughout: nothing here ever fails a request, it only
 * risks answering requests from data that is no longer trustworthy.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "source-data", label: "Source Data" },
    { id: "feature-pipeline", label: "Feature Pipeline" },
    { id: "feature-store", label: "Feature Store" },
    { id: "model-serving", label: "Model Serving" },
    { id: "decision-api", label: "Decision API" },
  ],
  edges: [
    { from: "source-data", to: "feature-pipeline" },
    { from: "feature-pipeline", to: "feature-store" },
    { from: "feature-store", to: "model-serving" },
    { from: "model-serving", to: "decision-api" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "source-data": "healthy",
  "feature-pipeline": "healthy",
  "feature-store": "healthy",
  "model-serving": "healthy",
  "decision-api": "healthy",
};
