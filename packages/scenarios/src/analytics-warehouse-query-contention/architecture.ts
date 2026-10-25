import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat fan-in (ArchitectureNode/ArchitectureEdge per
 * phase6e3.md; no groups, containers, or nesting). Three distinct
 * consumer classes (BI Users, Data Science, Scheduled Reports) all feed
 * the same Query Gateway, which fronts a single shared Warehouse. The
 * entire senior/staff-level judgment here is encoded as STATE on the
 * Query Gateway (which admission policy, which ad-hoc caps, which
 * long-running-query handling) and on Scheduled Reports/Data Science
 * (whose jobs are currently queued/held/killed) — never as additional
 * topology. This mirrors Database Lock Contention's discipline: the
 * graph stays small and flat; the difficulty comes entirely from reading
 * the right judgment (workload prioritization and stakeholder tradeoff),
 * not from the shape of the architecture.
 *
 * ROOT-CAUSE PLACEMENT: ad-hoc query load (BI Users' exploratory queries,
 * Data Science's heavy/long-running jobs) and Scheduled Reports' SLA-
 * bound critical jobs all compete for the same finite Query Gateway
 * admission slots and the same shared Warehouse compute. Nothing here is
 * a classic resource-exhaustion failure (no node ever goes fully down);
 * it is a contention/prioritization problem over who gets served first
 * and how ad-hoc load is bounded.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "bi-users", label: "BI Users" },
    { id: "data-science", label: "Data Science" },
    { id: "scheduled-reports", label: "Scheduled Reports" },
    { id: "query-gateway", label: "Query Gateway" },
    { id: "warehouse", label: "Warehouse" },
  ],
  edges: [
    { from: "bi-users", to: "query-gateway" },
    { from: "data-science", to: "query-gateway" },
    { from: "scheduled-reports", to: "query-gateway" },
    { from: "query-gateway", to: "warehouse" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "bi-users": "healthy",
  "data-science": "healthy",
  "scheduled-reports": "healthy",
  "query-gateway": "healthy",
  warehouse: "healthy",
};
