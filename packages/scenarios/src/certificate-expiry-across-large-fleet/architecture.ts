import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat linear pipeline (ArchitectureNode/
 * ArchitectureEdge, no groups/containers/nesting), per the brief's
 * suggested topology: Certificate Authority -> Secret Distribution ->
 * Service Fleet -> Load Balancers -> External Clients. Deliberately as
 * flat and small as every other Phase 6E sibling's pipeline (Data
 * Retention Policy Misconfiguration's 5-node pipeline, Service-to-
 * Service Credential Rotation Failure's 5-node pipeline) — the Senior-
 * Staff difficulty here comes entirely from a MULTI-DAY, multi-cohort
 * calendar-horizon sequencing judgment riding on top of this
 * architecture, never from the shape of the graph.
 *
 * COHORT MODELING: this is a LARGE FLEET with at least three cohorts —
 * legacy, modern, and critical — each with different rotation
 * capability, rollout speed, and dependency risk. Exactly like Data
 * Pipeline Freshness Collapse's Tier-1/Tier-2 datasets and Data
 * Retention Policy Misconfiguration's three data classes, cohort
 * identity is modeled as STATE/CONTROL on these same five nodes — never
 * a forked per-cohort subgraph. The Service Fleet node represents all
 * three cohorts' workload instances collectively; per-cohort rotation
 * progress and deadline risk are tracked as distinct metrics.ts fields
 * (modernCohortDaysToExpiry / criticalCohortDaysToExpiry /
 * legacyCohortDaysToExpiry, etc.), read by rules.ts/scoring.ts, never by
 * adding more nodes.
 *
 * ROOT CAUSE / TRIGGER: this is a genuinely PROACTIVE, calendar-driven
 * incident — no external failure degrades anything on its own. A large
 * fleet of TLS certificates issued by the Certificate Authority are
 * approaching their expiry deadline. If left unaddressed, External
 * Clients begin rejecting connections to the Load Balancers the instant
 * a cohort's certificate actually expires — a real, deterministic,
 * calendar-driven failure, not a random one. The entire system looks
 * perfectly healthy on every live dashboard for days while the deadline
 * clock runs down — this batch's "healthy dashboard hides the real
 * problem" pattern, carried into a DEADLINE-RISK axis where the danger
 * is temporal (how much calendar time is left) rather than a live
 * resource exhaustion.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "certificate-authority", label: "Certificate Authority" },
    { id: "secret-distribution", label: "Secret Distribution" },
    { id: "service-fleet", label: "Service Fleet" },
    { id: "load-balancers", label: "Load Balancers" },
    { id: "external-clients", label: "External Clients" },
  ],
  edges: [
    { from: "certificate-authority", to: "secret-distribution" },
    { from: "secret-distribution", to: "service-fleet" },
    { from: "service-fleet", to: "load-balancers" },
    { from: "load-balancers", to: "external-clients" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "certificate-authority": "healthy",
  "secret-distribution": "healthy",
  "service-fleet": "healthy",
  "load-balancers": "healthy",
  "external-clients": "healthy",
};
