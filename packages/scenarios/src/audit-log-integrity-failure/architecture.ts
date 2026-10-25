import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 5 nodes, 4 edges — a flat linear pipeline (ArchitectureNode/
 * ArchitectureEdge, no groups/containers/nesting), per this batch's
 * suggested topology: Services -> Audit Logger -> Event Stream ->
 * Immutable Store -> Compliance Reports. Deliberately as flat and small
 * as Data Retention Policy Misconfiguration's 5-node pipeline — the
 * Principal-level difficulty here comes entirely from the judgment axis
 * (evidence/audit-trail integrity: completeness, duplication, ordering,
 * immutability, honest reporting) riding on top of this architecture,
 * never from the shape of the graph.
 *
 * NO separate Reconciliation Worker node: reconciliation is modeled as
 * a control on the Event Stream / Immutable Store (reconciliationMode),
 * exactly as the brief allows ("Add a Reconciliation Worker node only if
 * load-bearing — a real control gates it"). A dedicated node would add
 * graph complexity with no additional control surface the existing
 * nodes don't already carry, so it is deliberately omitted.
 *
 * ROOT-CAUSE PLACEMENT: the incident originates between the Event
 * Stream and the Immutable Store — an upstream delivery degradation
 * causes audit events to arrive missing, duplicated, or out of order,
 * and some events can no longer be cryptographically/positionally
 * verified once they do arrive. Services and Audit Logger stay healthy/
 * uninvolved the entire incident — nothing here ever fails a customer-
 * facing request. The application can look completely healthy on every
 * uptime/latency dashboard while the EVIDENCE TRAIL itself (not the
 * numbers it reports on, not a secret exposure, not availability) is
 * actively untrustworthy — this batch's "healthy dashboard hides the
 * real problem" pattern, applied to audit/evidence trust.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "services", label: "Services" },
    { id: "audit-logger", label: "Audit Logger" },
    { id: "event-stream", label: "Event Stream" },
    { id: "immutable-store", label: "Immutable Store" },
    { id: "compliance-reports", label: "Compliance Reports" },
  ],
  edges: [
    { from: "services", to: "audit-logger" },
    { from: "audit-logger", to: "event-stream" },
    { from: "event-stream", to: "immutable-store" },
    { from: "immutable-store", to: "compliance-reports" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  services: "healthy",
  "audit-logger": "healthy",
  "event-stream": "healthy",
  "immutable-store": "healthy",
  "compliance-reports": "healthy",
};
