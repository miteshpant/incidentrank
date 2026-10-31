import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Orphaned Background Worker Queue Growth's own scoring configuration.
 * Every dimension uses the same generic, data-driven scorer every other
 * scenario uses (packages/scenarios/src/authoring/score.ts) — zero new
 * scoring logic was added for this scenario, per the binding "zero slug
 * branching" scoring architecture decision.
 *
 * maxPoints is the SAME fixed catalog-wide split every scenario uses
 * (recovery=300, customerImpact=200, dataIntegrity=200, reliability=150,
 * costEfficiency=100, operationalEfficiency=50 — see
 * validateAuthoredScenario's SCORE_MAX_BY_DIMENSION and
 * validateBuiltInScenario's reuse of the same table for built-ins).
 *
 * Investigation quality/prioritization is scored explicitly via the
 * existing `finalStringEquals` measure against the `diagnosisPath` state
 * value rules.ts authors directly — never inferred from roleInIncident
 * tags, which are reserved for the post-incident narrative only. This is
 * the same mechanism the checkout/payment/inventory Redis contention
 * reference incident and Kafka Partition Skew's orderingMode tradeoff
 * already use; investigation-quality scoring is a new DIMENSION here,
 * not a new MEASURE in the shared scorer.
 *
 * dataIntegrity's top band is reserved for `investigated-both-tracks-
 * fixed` specifically — completing both independent tracks (Track A:
 * roll back the deploy; Track B: raise worker concurrency) AFTER
 * demonstrably investigating all three signal sources. Completing both
 * tracks without investigating first ("both-tracks-fixed-no-
 * investigation") still resolves the incident but lands in the lower
 * band, exactly mirroring the reference incident's own
 * correlated-then-fixed vs. guessed-fix split.
 */
export const ORPHANED_BACKGROUND_WORKER_QUEUE_GROWTH_SCORING: AuthoredScoringConfig = {
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
        { atMost: 6_000, points: 200 },
        { atMost: 15_000, points: 150 },
        { atMost: 30_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate investigated all three signal sources before completing
      // BOTH independent tracks ("investigated-both-tracks-fixed"),
      // completed both tracks without demonstrating that investigation
      // ("both-tracks-fixed-no-investigation"), completed only one track,
      // chased a plausible-but-inferior remediation, or did nothing.
      // Every value is a literal rules.ts authors by hand — not derived
      // from roleInIncident, not computed by any generic "did they touch
      // root_cause" heuristic.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "diagnosisPath", value: "investigated-both-tracks-fixed" },
      bands: [
        { atMost: 0, points: 70 },
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
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        // Chasing a plausible-but-inferior remediation (restarting pods,
        // or pausing producers, without rolling back the deploy) instead
        // of the two genuine fix tracks is explicitly penalized here, in
        // addition to dataIntegrity's own lower band for an incomplete
        // diagnosisPath — operationalEfficiency measures the COST of the
        // wrong actions taken, dataIntegrity measures whether the right
        // diagnosis was ultimately reached; the two are intentionally not
        // the same dimension, mirroring the reference incident's own
        // split between the two.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
