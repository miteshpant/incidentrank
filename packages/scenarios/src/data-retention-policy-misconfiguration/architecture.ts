import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat linear pipeline (ArchitectureNode/
 * ArchitectureEdge, no groups/containers/nesting), per
 * phase-6e-strategy-spec.md's suggested topology for this scenario:
 * Application -> Event Store -> Data Lake -> Archive -> Deletion
 * Service. Deliberately as flat and small as Model Feature Freshness
 * Degradation's 5-node pipeline and Data Pipeline Freshness Collapse's
 * 5-node pipeline: the Principal-level difficulty here comes entirely
 * from a SECOND, independent judgment axis (compliance correctness,
 * per-data-class retention/deletion policy) riding on top of this
 * architecture, not from the shape of the graph. Which data CLASS
 * (financial records / user-deletion-request data / ephemeral logs) and
 * whether it is correctly retained/deleted is modeled as state/control
 * on these same five nodes — never a forked per-class subgraph — the
 * same discipline Data Pipeline Freshness Collapse uses for
 * Tier-1/Tier-2 datasets.
 *
 * ROOT-CAUSE PLACEMENT: the misconfiguration originates in the Deletion
 * Service (a bad retention-policy rollout changes which records it
 * purges and when) and the damage lands in the Archive (financial
 * records that should be legally retained get purged there) and in the
 * Data Lake (user-deletion-request data that should already be gone
 * stays resident there past its mandated deadline). Application and
 * Event Store stay healthy/uninvolved the entire incident — this is
 * deliberately NOT an availability incident: nothing here ever fails a
 * request. The entire system can look completely healthy on every
 * uptime/latency dashboard while a serious, quiet compliance violation
 * is actively in progress — this batch's "healthy dashboard hides the
 * real problem" pattern, carried into a compliance-correctness axis
 * where availability is explicitly secondary (phase-6e-strategy-
 * spec.md: "Availability is largely irrelevant").
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "application", label: "Application" },
    { id: "event-store", label: "Event Store" },
    { id: "data-lake", label: "Data Lake" },
    { id: "archive", label: "Archive" },
    { id: "deletion-service", label: "Deletion Service" },
  ],
  edges: [
    { from: "application", to: "event-store" },
    { from: "event-store", to: "data-lake" },
    { from: "data-lake", to: "archive" },
    { from: "archive", to: "deletion-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  application: "healthy",
  "event-store": "healthy",
  "data-lake": "healthy",
  archive: "healthy",
  "deletion-service": "healthy",
};
