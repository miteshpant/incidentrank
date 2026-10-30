import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Checkout/Payment/Inventory/Redis parallel reference incident's own
 * scoring configuration (Phase 10F). Every dimension except
 * operationalEfficiency uses the same generic, data-driven scorer every
 * other scenario uses (packages/scenarios/src/authoring/score.ts) — zero
 * new scoring logic was added for this scenario, per the binding "zero
 * slug branching" scoring architecture decision.
 *
 * Investigation quality/prioritization is scored explicitly via the
 * existing `finalStringEquals` measure against the `diagnosisPath` state
 * value rules.ts authors directly — never inferred from roleInIncident
 * tags, which are reserved for the post-incident narrative only. This is
 * the same mechanism Kafka Partition Skew's orderingMode tradeoff
 * already uses; investigation-quality scoring is a new DIMENSION here,
 * not a new MEASURE in the shared scorer.
 */
export const CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 250,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 250 },
        { atMost: 150, points: 200 },
        { atMost: 240, points: 150 },
        { atMost: 360, points: 90 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 8_000, points: 200 },
        { atMost: 20_000, points: 150 },
        { atMost: 40_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated Payment + Inventory + Redis before applying
      // the fix ("correlated-then-fixed"), applied the correct fix
      // without demonstrating that correlation ("guessed-fix"), chased
      // one of the two inferior single-service remediations, or did
      // nothing at all. Every value is a literal rules.ts authors by
      // hand — not derived from roleInIncident, not computed by any
      // generic "did they touch root_cause" heuristic.
      dimension: "dataIntegrity",
      maxPoints: 150,
      measure: { type: "finalStringEquals", field: "diagnosisPath", value: "correlated-then-fixed" },
      bands: [
        { atMost: 0, points: 60 },
        { points: 150 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 110 },
        { atMost: 0.5, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 60 },
        { atMost: 3, points: 30 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 150,
      penalties: [
        // Chasing an inferior single-service remediation instead of the
        // shared-dependency fix is explicitly penalized here, in
        // addition to dataIntegrity's own lower band for an incomplete
        // diagnosisPath — operationalEfficiency measures the COST of the
        // wrong actions taken, dataIntegrity measures whether the right
        // diagnosis was ultimately reached; the two are intentionally
        // not the same dimension, mirroring how harmfulChangeCount and
        // a scenario's own data-integrity measure stay independent
        // elsewhere in this codebase.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 20 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 15 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 30 },
      ],
    },
  ],
};
