import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Event Processing Backpressure's scoring configuration. This scenario's
 * central correctness-adjacent distinction is not data loss but WHICH
 * subsystem absorbed the transferred pressure once Kafka lag was
 * drained — downstreamPressure (set by rules.ts) is "balanced" only when
 * ingestion, processing, database, and external-API capacity were all
 * kept within bounds at once; "database-overloaded" /
 * "external-api-overloaded" mean a mitigation relieved the visible
 * Kafka-lag symptom only by pushing the bottleneck one hop downstream —
 * exactly the trap this scenario is designed to test. dataIntegrity
 * bands on this generically via finalStringEquals (the same pattern
 * Missing Database Index and Kafka Partition Skew already use), rather
 * than any scenario-specific scorer code.
 */
export const EVENT_PROCESSING_BACKPRESSURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 190 },
        { atMost: 300, points: 130 },
        { atMost: 480, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 6_000, points: 200 },
        { atMost: 18_000, points: 160 },
        { atMost: 35_000, points: 110 },
        { atMost: 60_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure comparing downstreamPressure against
      // "database-overloaded". measureDimension returns 1 when it
      // matches (pressure was pushed into the database rather than
      // balanced) and 0 otherwise — so "balanced", "low-priority-
      // deferred", "external-api-overloaded", and "unresolved" all fall
      // into the top band here; this dimension's job is specifically to
      // penalize the database-overloaded pressure-transfer trap.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "downstreamPressure", value: "database-overloaded" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 40 },
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
        { atMost: 0.4, points: 80 },
        { atMost: 1, points: 55 },
        { atMost: 2, points: 25 },
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
