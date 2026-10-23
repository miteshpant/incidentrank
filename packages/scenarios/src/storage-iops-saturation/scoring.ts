import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Storage IOPS Saturation's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed vs. merely suppressed" distinction
 * (storageRecoveryMode, set by rules.ts): the optimal path actually
 * raises storage's IOPS ceiling, while the acceptable path only pauses
 * the background workload generating the load. That distinction is
 * honestly integrity-adjacent — "is the system's underlying capacity
 * fixed, or only its symptom-generating workload suppressed" — so
 * dataIntegrity bands on it generically via finalStringEquals (same
 * pattern as Kafka Partition Skew's orderingMode and Missing Database
 * Index's orderHistoryQueryHealth), rather than tying optimal/
 * acceptable at a flat catch-all band. No scenario-specific scorer
 * code — every dimension uses the shared, generic measures from
 * packages/scenarios/src/authoring/score.ts.
 */
export const STORAGE_IOPS_SATURATION_SCORING: AuthoredScoringConfig = {
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
      // Generic string-state measure comparing storageRecoveryMode
      // against "workload-paused". measureDimension returns 1 when it
      // matches (the acceptable path: batch job suppressed, capacity
      // not actually raised) and 0 otherwise (the optimal
      // "tier-upgraded" path, and every still-unresolved/harmful path
      // alike) — so the `atMost: 0` band (measured 0) awards full marks
      // to "capacity genuinely fixed or incident simply unresolved,"
      // and only the workload-paused acceptable path falls through to
      // the lower fallback band.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: {
        type: "finalStringEquals",
        field: "storageRecoveryMode",
        value: "workload-paused",
      },
      bands: [
        { atMost: 0, points: 200 },
        { points: 160 },
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
