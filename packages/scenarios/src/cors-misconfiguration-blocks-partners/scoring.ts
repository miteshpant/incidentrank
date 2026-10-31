import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * CORS Misconfiguration Blocks Partner Integrations scoring
 * configuration. Every dimension uses the same generic, data-driven
 * scorer every other scenario uses (packages/scenarios/src/authoring/
 * score.ts) — zero new scoring logic, zero slug branching, per the
 * binding Phase 6 scoring architecture decision.
 *
 * maxPoints is the fixed catalog-wide split every scenario uses:
 * recovery=300, customerImpact=200, dataIntegrity=200, reliability=150,
 * costEfficiency=100, operationalEfficiency=50 (sums to 1000).
 *
 * Investigation quality is scored explicitly via the existing
 * `finalStringEquals` measure against the `diagnosisPath` state value
 * rules.ts authors directly — "correlated-then-fixed" (investigated all
 * three signal sources, then allowlisted the partner origins) earns full
 * dataIntegrity credit; any other terminal diagnosisPath earns the lower
 * band. This is the same mechanism the reference incident
 * (checkout-payment-inventory-redis-contention) and Kafka Partition
 * Skew's orderingMode tradeoff already use.
 *
 * operationalEfficiency's penalties double-count the wildcard-open trap
 * as a harmful configuration change (action-classifications.ts) on top
 * of reliability/customerImpact never rewarding it (successCondition
 * excludes it entirely via corsPolicyStatus, so an attempt that only
 * ever reaches wildcard-open can never resolve and is scored through the
 * unresolved/failed terminalOverrides below instead).
 */
export const CORS_MISCONFIGURATION_BLOCKS_PARTNERS_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 240 },
        { atMost: 240, points: 180 },
        { atMost: 360, points: 110 },
        { points: 40 },
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
    // Explicit, authored investigation-quality scoring — whether the
    // candidate correlated the policy diff, the partner error logs, and
    // the preflight responses before allowlisting the partner origins
    // ("correlated-then-fixed"), applied the correct fix without
    // demonstrating that correlation ("guessed-fix"), chased one of the
    // two inferior single-service remediations, fell for the wildcard
    // trap, or did nothing at all. Every value is a literal rules.ts
    // authors by hand — not derived from roleInIncident.
    {
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "diagnosisPath", value: "correlated-then-fixed" },
      bands: [
        { atMost: 0, points: 80 },
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
      // operationalEfficiency measures the COST of the wrong actions
      // taken; dataIntegrity measures whether the right diagnosis was
      // ultimately reached. The two are intentionally independent, as
      // in the reference incident.
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
