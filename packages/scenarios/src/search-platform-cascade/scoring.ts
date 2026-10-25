import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Search Platform Cascade's scoring configuration.
 *
 * The real correctness signal this scenario models is the historical,
 * cumulative staleOrUnrelatedResultsServedCount (rules.ts) -- direct,
 * authored evidence that search responses were served outside the
 * allowed correctness bound. That numeric count is read via
 * peakNumericValues (numericWatchFields trackPeak in definition.ts),
 * which the generic scorer's fixed measures cannot band directly, so
 * Data Integrity instead uses `penalties` mode against
 * finalStringEquals("responsePathMode", "unsafe-partial-results") --
 * the one authored string value that is ONLY ever reached by the exact
 * combination that grows this counter. A candidate who ever drove the
 * system into that combination is penalized here regardless of what the
 * FINAL state looks like, matching the historical-damage requirement
 * that a past correctness violation is never erased by a later fix.
 * "restored-too-early" and "scale-the-symptom" are penalized on a
 * second, independent measure (harmfulChangeCount) rather than on
 * dataIntegrity, since they are pressure/availability problems, not
 * correctness violations -- keeping Data Integrity scoped to the one
 * real correctness signal this scenario authors.
 */
export const SEARCH_PLATFORM_CASCADE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 200 },
        { atMost: 300, points: 140 },
        { atMost: 480, points: 80 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 150, points: 200 },
        { atMost: 400, points: 160 },
        { atMost: 900, points: 100 },
        { atMost: 2_000, points: 50 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: the one authored value that is
      // ONLY ever reached by the unsafe partial-results-without-cache
      // combination that grows staleOrUnrelatedResultsServedCount.
      // Penalty mode (not bands) so this stays a flat deduction off a
      // real correctness ceiling rather than a banded numeric measure
      // the generic engine has no direct numeric accessor for.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "responsePathMode", value: "unsafe-partial-results" },
          atLeast: 1,
          subtractPoints: 150,
        },
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
        { atMost: 0.7, points: 55 },
        { atMost: 1.2, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
