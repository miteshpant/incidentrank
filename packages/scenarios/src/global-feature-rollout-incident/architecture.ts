import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 7 nodes, 8 edges — flat (ArchitectureNode/ArchitectureEdge per
 * phase6d.4.md section 3; no groups/containers/nesting). Mirrors the
 * spec exactly: Global Clients -> Traffic Router -> Feature Flag
 * Platform, which fans out to three independently-controllable regional
 * service fleets, all three of which write into one Shared Data Store.
 * The three-way fan-out from Feature Flag Platform plus the three-way
 * fan-in to Shared Data Store is what makes "a region may diverge from
 * the others, and the store sees all of them" legible on a flat graph
 * with no additional topology (sub-regions, per-service queues, etc.)
 * required.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-clients", label: "Global Clients" },
    { id: "traffic-router", label: "Traffic Router" },
    { id: "feature-flag-platform", label: "Feature Flag Platform" },
    { id: "us-service-fleet", label: "US Service Fleet" },
    { id: "eu-service-fleet", label: "EU Service Fleet" },
    { id: "apac-service-fleet", label: "APAC Service Fleet" },
    { id: "shared-data-store", label: "Shared Data Store" },
  ],
  edges: [
    { from: "global-clients", to: "traffic-router" },
    { from: "traffic-router", to: "feature-flag-platform" },
    { from: "feature-flag-platform", to: "us-service-fleet" },
    { from: "feature-flag-platform", to: "eu-service-fleet" },
    { from: "feature-flag-platform", to: "apac-service-fleet" },
    { from: "us-service-fleet", to: "shared-data-store" },
    { from: "eu-service-fleet", to: "shared-data-store" },
    { from: "apac-service-fleet", to: "shared-data-store" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-clients": "healthy",
  "traffic-router": "healthy",
  "feature-flag-platform": "healthy",
  "us-service-fleet": "healthy",
  "eu-service-fleet": "healthy",
  "apac-service-fleet": "healthy",
  "shared-data-store": "healthy",
};
