import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * API -> Aggregator -> five parallel downstream calls per inbound request
 * (docs/implementation_plan/phase6b.md, scenario 36). Service A (pricing),
 * Service B (inventory), Service C (shipping estimate), and Service D
 * (tax calculation) are all core to completing a product-detail response.
 * Service E (recommendation enrichment) is optional cross-sell content —
 * the response is still a complete, correct product page without it.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api", label: "API" },
    { id: "aggregator", label: "Aggregator" },
    { id: "service-a", label: "Service A (Pricing)" },
    { id: "service-b", label: "Service B (Inventory)" },
    { id: "service-c", label: "Service C (Shipping Estimate)" },
    { id: "service-d", label: "Service D (Tax Calculation)" },
    { id: "service-e", label: "Service E (Recommendation Enrichment)" },
  ],
  edges: [
    { from: "api", to: "aggregator" },
    { from: "aggregator", to: "service-a" },
    { from: "aggregator", to: "service-b" },
    { from: "aggregator", to: "service-c" },
    { from: "aggregator", to: "service-d" },
    { from: "aggregator", to: "service-e" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  aggregator: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-d": "healthy",
  "service-e": "healthy",
};
