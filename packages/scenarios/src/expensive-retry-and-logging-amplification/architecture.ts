import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Flat, 6-node architecture (per the brief): API -> Worker ->
 * External Dependency; API and Worker both also feed a shared Logging
 * + Telemetry Pipeline, which writes into the Log Store.
 *
 * External Dependency is a DECOY node: it is never meaningfully
 * degraded by any rule in this scenario (see rules.ts) — it stays
 * healthy throughout, including the worst-cost states. The incident is
 * entirely self-inflicted by a recent deploy/config change that raised
 * retry frequency, logging verbosity, telemetry duplication, and
 * payload logging size — never by anything actually wrong with the
 * dependency itself. This is the scenario's deliberate distinction from
 * cross-service-retry-amplification / message-retry-storm / payment-
 * retry-storm, all of which are driven by a REAL external degradation.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "api", label: "API" },
    { id: "worker", label: "Worker" },
    { id: "external-dependency", label: "External Dependency" },
    { id: "logging-telemetry-pipeline", label: "Logging + Telemetry Pipeline" },
    { id: "log-store", label: "Log Store" },
  ],
  edges: [
    { from: "api", to: "worker" },
    { from: "worker", to: "external-dependency" },
    { from: "api", to: "logging-telemetry-pipeline" },
    { from: "worker", to: "logging-telemetry-pipeline" },
    { from: "logging-telemetry-pipeline", to: "log-store" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  worker: "healthy",
  "external-dependency": "healthy",
  "logging-telemetry-pipeline": "healthy",
  "log-store": "healthy",
};
