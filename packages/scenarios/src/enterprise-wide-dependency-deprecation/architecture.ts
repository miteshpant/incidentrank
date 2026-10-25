import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 9 nodes, 9 edges — flat (no groups/containers/nesting), per
 * phase-6e-strategy-spec.md's suggested topology: Product A/B/C/D each
 * depend on the Shared SDK, which wraps the Deprecated External API;
 * Replacement API sits alongside it as the migration target. Migration
 * Coordinator and Compatibility Layer are both genuinely load-bearing —
 * Migration Coordinator is where migrationCohortOrder/deadlineEscalation/
 * rollbackReadiness live (the governance/sequencing layer), and
 * Compatibility Layer is the real, controllable node that unblocks
 * Product C (see controls.ts's COMPATIBILITY_LAYER_MODE_KEY) and that the
 * business invariants explicitly forbid becoming a permanent single
 * point of failure.
 *
 * ROOT SITUATION (not a classic outage): the Deprecated External API has
 * a hard, known deprecation deadline. At incident start, the four
 * products are already at different real migration stages — Product A
 * migrated (but unverified, a deliberate trap seed), Product B
 * partially migrated, Product C blocked on a compatibility issue with
 * the Replacement API, Product D untouched. Nothing here fails a
 * request; every live traffic-serving metric can read healthy the whole
 * time the deadline quietly approaches — the "green dashboard hides the
 * approaching deadline" trap this batch requires.
 *
 * FLAGSHIP CONSTRAINT: no single node's health and no single control
 * resolves the scenario. Migration Coordinator/Compatibility Layer only
 * ever reach "healthy" once the actual governance work (verified
 * migrations, bounded dual-support, drained deprecated traffic, prepared
 * rollback) has genuinely happened — see rules.ts.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "product-a", label: "Product A" },
    { id: "product-b", label: "Product B" },
    { id: "product-c", label: "Product C" },
    { id: "product-d", label: "Product D" },
    { id: "shared-sdk", label: "Shared SDK" },
    { id: "migration-coordinator", label: "Migration Coordinator" },
    { id: "compatibility-layer", label: "Compatibility Layer" },
    { id: "deprecated-external-api", label: "Deprecated External API" },
    { id: "replacement-api", label: "Replacement API" },
  ],
  edges: [
    { from: "product-a", to: "shared-sdk" },
    { from: "product-b", to: "shared-sdk" },
    { from: "product-c", to: "shared-sdk" },
    { from: "product-d", to: "shared-sdk" },
    { from: "shared-sdk", to: "compatibility-layer" },
    { from: "compatibility-layer", to: "deprecated-external-api" },
    { from: "compatibility-layer", to: "replacement-api" },
    { from: "migration-coordinator", to: "shared-sdk" },
    { from: "migration-coordinator", to: "compatibility-layer" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "product-a": "healthy",
  "product-b": "healthy",
  "product-c": "healthy",
  "product-d": "healthy",
  "shared-sdk": "healthy",
  "migration-coordinator": "healthy",
  "compatibility-layer": "healthy",
  "deprecated-external-api": "healthy",
  "replacement-api": "healthy",
};
