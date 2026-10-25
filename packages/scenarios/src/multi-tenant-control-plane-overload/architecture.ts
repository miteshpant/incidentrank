import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Deliberately flat, 6-node architecture (phase6dsupport.md section 3 —
 * use the existing flat ArchitectureNode/ArchitectureEdge representation
 * first; no region containers, no subsystem groups).
 *
 * The control plane (scheduler, config-service, policy-engine,
 * metadata-db) and the data plane (worker-fleet) are two separate failure
 * domains the candidate must distinguish. tenant-apis is the single
 * ingress both config-management requests (from any tenant, including
 * the hot one) and ordinary customer requests arrive through, then fan
 * out to either side — this is the architectural reason a control-plane
 * emergency can look, at a glance, like it might be a customer-facing
 * outage: both paths share the front door.
 *
 * Individual tenants (Tenant A/B/C) are deliberately NOT modeled as
 * architecture nodes. A tenant is a traffic source/identity, not
 * infrastructure the candidate operates on — the candidate's levers
 * (quota, priority, queue partitioning) are all control-plane-side knobs
 * keyed by tenant, not nodes with their own health/edges. Adding three
 * tenant nodes feeding into tenant-apis would add visual width without
 * adding any node the candidate can reason about differently from the
 * others (see architectureReadability in the authoring report).
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "tenant-apis", label: "Tenant APIs" },
    { id: "scheduler", label: "Scheduler" },
    { id: "config-service", label: "Config Service" },
    { id: "policy-engine", label: "Policy Engine" },
    { id: "metadata-db", label: "Metadata DB" },
    { id: "worker-fleet", label: "Worker Fleet" },
  ],
  edges: [
    { from: "tenant-apis", to: "config-service" },
    { from: "config-service", to: "policy-engine" },
    { from: "policy-engine", to: "scheduler" },
    { from: "scheduler", to: "metadata-db" },
    { from: "scheduler", to: "worker-fleet" },
    { from: "tenant-apis", to: "worker-fleet" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "healthy",
  scheduler: "healthy",
  "config-service": "healthy",
  "policy-engine": "healthy",
  "metadata-db": "healthy",
  "worker-fleet": "healthy",
};
