import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 7 nodes, 8 edges — flat (ArchitectureNode/ArchitectureEdge per
 * phase6d3.md section 3; no groups/containers/nesting). The architecture
 * mirrors the spec exactly: Requests -> API Gateway -> Policy Decision
 * Point, with the PDP fanning out to its three real-time dependencies
 * (Policy Store, Identity Context, Resource Metadata), plus a separate
 * Policy Rollout / Cache Distribution node that feeds BOTH the Policy
 * Store (what new fetches receive) and the PDP directly (modeling the
 * PDP's own local policy cache, which the rollout/distribution pipeline
 * pushes into independently of a fresh Policy Store read). This two-edge
 * fan-in from Policy Rollout is what makes policy-version skew legible
 * as two distinct things on a flat graph: "what the Policy Store would
 * serve on a fresh read" vs. "what the PDP's own cache is currently
 * enforcing" — exactly the skew this scenario is about, with no
 * additional topology (regions, containers, per-instance nodes) required
 * to express it.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "requests", label: "Requests" },
    { id: "api-gateway", label: "API Gateway" },
    { id: "policy-decision-point", label: "Policy Decision Point" },
    { id: "policy-store", label: "Policy Store" },
    { id: "identity-context", label: "Identity Context" },
    { id: "resource-metadata", label: "Resource Metadata" },
    { id: "policy-rollout", label: "Policy Rollout / Cache Distribution" },
  ],
  edges: [
    { from: "requests", to: "api-gateway" },
    { from: "api-gateway", to: "policy-decision-point" },
    { from: "policy-decision-point", to: "policy-store" },
    { from: "policy-decision-point", to: "identity-context" },
    { from: "policy-decision-point", to: "resource-metadata" },
    { from: "policy-rollout", to: "policy-store" },
    { from: "policy-rollout", to: "policy-decision-point" },
    { from: "policy-store", to: "policy-decision-point" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  requests: "healthy",
  "api-gateway": "healthy",
  "policy-decision-point": "healthy",
  "policy-store": "healthy",
  "identity-context": "healthy",
  "resource-metadata": "healthy",
  "policy-rollout": "healthy",
};
