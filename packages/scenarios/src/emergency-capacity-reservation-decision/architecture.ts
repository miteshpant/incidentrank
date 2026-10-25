import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 7 nodes, 8 edges — a flat, shallow fan-out (ArchitectureNode/
 * ArchitectureEdge, no groups/containers/nesting), per
 * phase6e4.md's suggested topology for scenario 99: Demand Forecasting ->
 * Capacity Planner -> {Region A, Region B, Region C}, each region
 * feeding its own Reserved Capacity and On-Demand Capacity pools.
 * Reserved/On-Demand are modeled as two SHARED pool nodes fed by all
 * three regions (rather than six per-region pool nodes) — the real
 * economic/operational distinction this scenario tests is RESERVED vs.
 * ON-DEMAND spend and REGIONAL distribution, not six independent
 * sub-pools; per-region reservation LEVEL is modeled as control/state on
 * the three region nodes themselves, exactly the same discipline Data
 * Retention Policy Misconfiguration uses for its three data classes on
 * one Deletion Service node rather than forking a subgraph per class.
 *
 * ROOT SITUATION: this is a PROACTIVE, pre-event decision, not a live
 * failure. Nothing here starts broken. Demand Forecasting has produced
 * an uncertain, genuinely wide (p50/p90/p99) demand band for an
 * approaching major event; Capacity Planner is where the candidate's
 * reservation decision is made; the three Region nodes are where that
 * decision's regional distribution (and any hidden concentration risk)
 * becomes visible; Reserved Capacity / On-Demand Capacity are where the
 * decision's cost and headroom consequences land. No node here fails a
 * live request at incident start — the entire judgment is about a
 * decision taken BEFORE the event, whose consequences only become
 * visible once the event itself actually arrives (see timed-events.ts).
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "demand-forecasting", label: "Demand Forecasting" },
    { id: "capacity-planner", label: "Capacity Planner" },
    { id: "region-a", label: "Region A" },
    { id: "region-b", label: "Region B" },
    { id: "region-c", label: "Region C" },
    { id: "reserved-capacity", label: "Reserved Capacity" },
    { id: "on-demand-capacity", label: "On-Demand Capacity" },
  ],
  edges: [
    { from: "demand-forecasting", to: "capacity-planner" },
    { from: "capacity-planner", to: "region-a" },
    { from: "capacity-planner", to: "region-b" },
    { from: "capacity-planner", to: "region-c" },
    { from: "region-a", to: "reserved-capacity" },
    { from: "region-b", to: "reserved-capacity" },
    { from: "region-c", to: "reserved-capacity" },
    { from: "capacity-planner", to: "on-demand-capacity" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "demand-forecasting": "healthy",
  "capacity-planner": "healthy",
  "region-a": "healthy",
  "region-b": "healthy",
  "region-c": "healthy",
  "reserved-capacity": "healthy",
  "on-demand-capacity": "healthy",
};
