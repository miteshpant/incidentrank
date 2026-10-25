import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Multi-Tenant Control Plane Overload's scoring configuration.
 *
 * dataIntegrity bands on finalStringEquals("hotTenantContainment",
 * "quota-enforced") -- the structural fix -- generically, following
 * Network Partition's ledgerSafetyMechanism precedent: no scenario-
 * specific scorer code, just the generic string-state measure comparing
 * ScoringInputs.finalStringValues against an authored value.
 * "quota-enforced" scores full marks (the hot tenant's own consumption
 * was actually bounded below the 30% ceiling); "lane-only" (unrelated
 * tenants protected, hot tenant never throttled) and "unmitigated"
 * (covers both the untouched baseline and the worker-scaling-trap,
 * where real metadata writes were dropped) both score the lowest band.
 * This directly expresses that a candidate who only protects OTHER
 * tenants (lane-only) or who introduces real metadata write loss
 * (worker-scaling trap) never reaches top Data Integrity, regardless of
 * how healthy dataPlaneSuccessRate reads at any given moment.
 */
export const MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 150, points: 300 },
        { atMost: 240, points: 240 },
        { atMost: 360, points: 180 },
        { atMost: 540, points: 110 },
        { atMost: 720, points: 60 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 500, points: 200 },
        { atMost: 2_000, points: 160 },
        { atMost: 6_000, points: 110 },
        { atMost: 15_000, points: 55 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: full marks only when
      // hotTenantContainment === "quota-enforced" -- the structural
      // per-tenant-ceiling fix. Every other value, including the
      // fairness-only lane mitigation and the worker-scaling/unmitigated
      // trap, scores the lowest band -- regardless of how healthy
      // dataPlaneSuccessRate happens to read.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "hotTenantContainment", value: "quota-enforced" },
      bands: [
        { atMost: 0, points: 50 },
        { points: 200 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 115 },
        { atMost: 0.5, points: 80 },
        { atMost: 0.7, points: 45 },
        { points: 15 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 7, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 10, subtractPoints: 10 },
      ],
    },
  ],
};
