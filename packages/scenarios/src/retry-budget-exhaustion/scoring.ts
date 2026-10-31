import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Retry Budget Exhaustion's own scoring configuration. Every dimension
 * uses the same generic, data-driven scorer every other scenario uses
 * (packages/scenarios/src/authoring/score.ts) — zero new scoring logic
 * added for this scenario, per the binding "zero slug branching" scoring
 * architecture decision (Phase 6).
 *
 * maxPoints is the SAME fixed per-dimension value every scenario in the
 * catalog uses: recovery=300, customerImpact=200, dataIntegrity=200,
 * reliability=150, costEfficiency=100, operationalEfficiency=50 (sums to
 * 1000). See the reference incident's own scoring.ts for the Phase 10G
 * history of why this must never be a scenario-invented split.
 *
 * Investigation-quality scoring is authored explicitly via the existing
 * `finalStringEquals` measure against the `diagnosisPath` state value
 * rules.ts authors directly — correlated-then-fixed (investigated then
 * applied the real fix) scores full dataIntegrity points; any other
 * terminal diagnosisPath (guessed-fix, bounded-retries-no-breaker,
 * scaled-pricing-only, or not-attempted) scores the lower band. This is
 * the same mechanism the reference incident and Kafka Partition Skew's
 * orderingMode tradeoff already use.
 */
export const RETRY_BUDGET_EXHAUSTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 240 },
        { atMost: 210, points: 180 },
        { atMost: 330, points: 110 },
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
      // candidate investigated the retry metrics before applying the
      // bounded-retries + circuit-breaker fix ("correlated-then-fixed"),
      // applied the correct fix without demonstrating that investigation
      // ("guessed-fix"), applied only half the fix
      // ("bounded-retries-no-breaker"), chased the plausible-but-inferior
      // single remediation of scaling Pricing Service
      // ("scaled-pricing-only"), or did nothing at all
      // ("not-attempted"). Every value is a literal rules.ts authors by
      // hand — never derived from roleInIncident.
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
      // Chasing the inferior single-remediation (scaling Pricing
      // Service) instead of fixing the retry policy is explicitly
      // penalized here, in addition to dataIntegrity's own lower band
      // for an incomplete diagnosisPath — operationalEfficiency measures
      // the COST of the wrong actions taken, dataIntegrity measures
      // whether the right diagnosis was ultimately reached.
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
