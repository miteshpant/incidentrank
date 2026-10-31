import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Platform-Wide Clock Skew Breaks Distributed Consensus's own scoring
 * configuration. Every dimension uses the same generic, data-driven
 * scorer every other scenario uses (packages/scenarios/src/authoring/
 * score.ts) — zero new scoring logic added, per the binding "zero slug
 * branching" scoring architecture decision (phase6_scoring_architecture).
 *
 * maxPoints per dimension is the fixed catalog-wide split, unchanged:
 * recovery=300, customerImpact=200, dataIntegrity=200, reliability=150,
 * costEfficiency=100, operationalEfficiency=50 (sums to 1000).
 *
 * dataIntegrity scores investigation quality explicitly via the existing
 * `finalStringEquals` measure against the `diagnosisPath` state value
 * rules.ts authors directly — whether the candidate correlated the NTP
 * sync status with all three affected subsystems before resyncing
 * clocks ("unified-then-fixed"), which is the whole causal-unification
 * lesson this scenario is built to test: ONE root cause cascading into
 * simultaneous, seemingly-unrelated failures, rather than three separate
 * single-subsystem bugs.
 */
export const PLATFORM_WIDE_CLOCK_SKEW_BREAKS_DISTRIBUTED_CONSENSUS_SCORING: AuthoredScoringConfig =
  {
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
          { atMost: 10_000, points: 200 },
          { atMost: 25_000, points: 150 },
          { atMost: 50_000, points: 90 },
          { points: 20 },
        ],
      },
      {
        // Explicit, authored investigation-quality scoring — did the
        // candidate recognize this was ONE shared root cause (the NTP
        // sync failure) behind THREE simultaneous subsystem symptoms,
        // versus guessing the correct fix without demonstrating that
        // correlation, versus resyncing clocks but skipping the
        // follow-up re-election, versus chasing a single-subsystem
        // restart. Every value is a literal rules.ts authors by hand —
        // not derived from roleInIncident, not computed by any generic
        // "did they touch root_cause" heuristic.
        dimension: "dataIntegrity",
        maxPoints: 200,
        measure: { type: "finalStringEquals", field: "diagnosisPath", value: "unified-then-fixed" },
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
          // Chasing a single-subsystem restart instead of resyncing the
          // shared clock source is explicitly penalized here, in
          // addition to dataIntegrity's own lower band for an
          // incomplete diagnosisPath — operationalEfficiency measures
          // the COST of the wrong actions taken, dataIntegrity measures
          // whether the right diagnosis was ultimately reached.
          { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
          { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
          { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
        ],
      },
    ],
  };
