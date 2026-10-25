import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Clients -> Gateway -> API Service -> Aggregator -> {Dependency A,
 * Dependency B, Dependency C} (docs/implementation_plan/phase6d.4.md,
 * scenario 77). A payload/data-shape change widened what the Aggregator
 * requests from, and holds in memory from, all three dependencies per
 * inbound request before projecting a final response. Dependency A has
 * the smallest heap headroom in the fleet, so it is the first component
 * to visibly GC-thrash — a misleading symptom location. The true root
 * cause is upstream: the Aggregator is now building and holding an
 * oversized per-request aggregation object, which raises memory pressure
 * on the Aggregator itself, on the API Service tier that queues work
 * ahead of it, and on ALL THREE dependencies (A, B, C) simultaneously —
 * not only the one that happens to fail first.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "gateway", label: "Gateway" },
    { id: "api-service", label: "API Service" },
    { id: "aggregator", label: "Aggregator" },
    { id: "dependency-a", label: "Dependency A" },
    { id: "dependency-b", label: "Dependency B" },
    { id: "dependency-c", label: "Dependency C" },
  ],
  edges: [
    { from: "clients", to: "gateway" },
    { from: "gateway", to: "api-service" },
    { from: "api-service", to: "aggregator" },
    { from: "aggregator", to: "dependency-a" },
    { from: "aggregator", to: "dependency-b" },
    { from: "aggregator", to: "dependency-c" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "healthy",
  "api-service": "healthy",
  aggregator: "healthy",
  "dependency-a": "healthy",
  "dependency-b": "healthy",
  "dependency-c": "healthy",
};
