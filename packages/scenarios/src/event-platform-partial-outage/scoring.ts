import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Event Platform Partial Outage's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d.2.md section 12's explicit instruction): dropped Topic A
 * events must score materially worse even if recovery time/customer
 * impact look excellent. The generic scorer's literal "dataIntegrity"
 * measure always returns 0 (see score.ts's measureDimension) and there
 * is no numeric-threshold penalty measure in the generic scorer
 * (AuthoredScoringMeasure has only the two string-state forms,
 * finalStringEquals/NotEquals — see schema.ts), so this dimension uses
 * `penalties` mode against `platformStatus`, the single authoritative
 * correctness/health summary string authored in rules.ts. Every rule
 * state where Topic A has ever been contaminated during this attempt
 * (topicAEventsDroppedTotal nonzero in the matched final rule) sets
 * platformStatus to "critical" — the same string also covers the
 * unmitigated baseline and pressure-transfer trap, which is intentional:
 * availability-good/correctness-bad and simply-unmitigated both land in
 * the harshest dataIntegrity band, never masked by a healthy-looking
 * live reading elsewhere.
 */
export const EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 220, points: 300 },
        { atMost: 300, points: 250 },
        { atMost: 380, points: 190 },
        { atMost: 480, points: 120 },
        { atMost: 600, points: 60 },
        { points: 15 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 1_500, points: 200 },
        { atMost: 4_000, points: 160 },
        { atMost: 9_000, points: 100 },
        { atMost: 20_000, points: 50 },
        { points: 10 },
      ],
    },
    {
      // Penalties mode against platformStatus — see module doc comment.
      // "degraded" (actively still-mitigating or draining states) keeps
      // full credit; "critical" (unmitigated baseline, the Topic A
      // contamination trap, and the scarred-but-live-safe state) loses
      // the overwhelming majority of this dimension's points, since
      // every one of those states either has an active correctness
      // violation or carries a historical one forward.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "platformStatus", value: "critical" },
          atLeast: 1,
          subtractPoints: 180,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.1, points: 150 },
        { atMost: 0.25, points: 115 },
        { atMost: 0.45, points: 80 },
        { atMost: 0.65, points: 45 },
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
        { atMost: 1, points: 30 },
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
