import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Regulatory Data-Residency Violation During Cross-Region Failover
 * scoring configuration. Every dimension uses the same generic,
 * data-driven scorer every other scenario uses
 * (packages/scenarios/src/authoring/score.ts) — zero new scoring logic
 * added, per the binding "zero slug branching" scoring architecture
 * decision. maxPoints per dimension is the fixed catalog-wide split
 * (recovery=300, customerImpact=200, dataIntegrity=200, reliability=150,
 * costEfficiency=100, operationalEfficiency=50 — see
 * validateAuthoredScenario's SCORE_MAX_BY_DIMENSION), summing to exactly
 * 1000.
 *
 * Investigation quality is scored explicitly via the existing
 * `finalStringEquals` measure against the `investigationQuality` state
 * value rules.ts authors directly — exactly the mechanism the reference
 * incident and API Version Sunset's branching scenario already use.
 * Both the "correlated" and "guessed" variants of the
 * failed-back-after-recovery strategy are the only ones ever credited
 * here; this scenario's branching lesson is about WHETHER the candidate
 * waited for genuine recovery before acting (and verified it), not about
 * which of fail-back/stay-failed-over is objectively correct in the
 * abstract — both of those remain genuinely live tradeoffs the moment
 * EU's infrastructure has NOT yet recovered, which is exactly why this
 * scenario's strategy choice is captured by recovery/customerImpact/
 * reliability naturally diverging between branches (the early-action
 * branches reopen an availability outage; the stay-failed-over branch
 * lets the violation accrue for the full incident), not by dataIntegrity
 * declaring one timing decision correct over the other in a vacuum.
 */
export const REGULATORY_DATA_RESIDENCY_VIOLATION_DURING_FAILOVER_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 200, points: 300 },
        { atMost: 260, points: 240 },
        { atMost: 340, points: 180 },
        { atMost: 450, points: 110 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 1_500, points: 200 },
        { atMost: 6_000, points: 150 },
        { atMost: 20_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated the failover routing logs, the
      // data-residency audit trail, and the legal notification
      // requirements before committing to a strategy. Only the fully
      // correlated failed-back-after-recovery path earns full credit; a
      // guessed-but-correct timing earns the lower band; every early
      // action, the stay-failed-over path, and doing nothing all leave
      // `investigationQuality` at its uncredited value.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "investigationQuality", value: "correlated" },
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
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        // Forcing either harmful early-action path (early fail-back, or
        // enabling the data-lock gateway before genuine recovery) is
        // explicitly penalized here, in addition to dataIntegrity's own
        // lower band for an incomplete investigationQuality —
        // operationalEfficiency measures the COST of the wrong actions
        // taken, dataIntegrity measures whether a correct, well-timed
        // strategy was ultimately reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
