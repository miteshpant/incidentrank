import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat linear ML pipeline (ArchitectureNode/
 * ArchitectureEdge per phase6e3.md; no groups, containers, or nesting).
 * Deliberately linear and small, same discipline as Model Feature
 * Freshness Degradation's 5-node serving path: the entire Principal-
 * level difficulty here comes from correctly reading a judgment axis
 * (artifact trust / promotion-gate / rollback / lineage) that never
 * shows up on any node's own uptime/latency numbers — not from the
 * shape of the graph. No additional topology (no separate "shadow
 * evaluation" node, no separate "quarantine shelf" node) is needed:
 * artifact trust state, lineage status, and quarantine disposition are
 * all modeled as state/control on the existing Model Registry node,
 * exactly the way Model Feature Freshness Degradation models
 * "freshness" as state rather than forking the graph per feature class.
 *
 * ROOT-CAUSE PLACEMENT: the incident originates in Training Data (a bad
 * label-join / corrupted upstream feature slice enters the training
 * set) and propagates through the Feature Builder and Trainer — the
 * Trainer itself runs successfully and produces a technically valid
 * artifact (training converges, basic health checks pass) that is
 * semantically wrong. Model Registry and Deployment Pipeline are
 * architecturally downstream of a DATA-QUALITY problem, not an
 * infrastructure failure — this is why their own
 * uptime/throughput fields stay green throughout: nothing here ever
 * fails a training run or a deployment, it only risks promoting and
 * serving an artifact that should never have been trusted.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "training-data", label: "Training Data" },
    { id: "feature-builder", label: "Feature Builder" },
    { id: "trainer", label: "Trainer" },
    { id: "model-registry", label: "Model Registry" },
    { id: "deployment-pipeline", label: "Deployment Pipeline" },
  ],
  edges: [
    { from: "training-data", to: "feature-builder" },
    { from: "feature-builder", to: "trainer" },
    { from: "trainer", to: "model-registry" },
    { from: "model-registry", to: "deployment-pipeline" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "training-data": "healthy",
  "feature-builder": "healthy",
  trainer: "healthy",
  "model-registry": "healthy",
  "deployment-pipeline": "healthy",
};
