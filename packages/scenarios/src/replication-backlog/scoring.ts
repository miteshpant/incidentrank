import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Replication Backlog's scoring configuration. The scenario's real
 * integrity-adjacent distinction is `replicationHealth` (set by
 * rules.ts): "throughput-matched" means the backlog was actually
 * cleared and accepted write volume now sustainably matches apply
 * capacity (the durable fix, reachable via either the throttle or the
 * parallelism/batching strategy); "reads-isolated" means only the
 * read-freshness symptom was addressed while the backlog itself kept
 * growing unbounded; "backlogged" means neither happened. dataIntegrity
 * bands on finalStringEquals against "throughput-matched" directly
 * (same generic pattern as Missing Database Index's
 * orderHistoryQueryHealth and Kafka Partition Skew's orderingMode) so
 * the "fixed the pipeline vs. only isolated its symptom" distinction is
 * scored explicitly rather than only showing up indirectly through
 * recovery time (which never resolves for a backlog that is still
 * growing, since successCondition requires replicationLagMs itself to
 * be low — see revenue-and-cost.ts's dual-field gate).
 */
export const REPLICATION_BACKLOG_SCORING: AuthoredScoringConfig = {
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
        { atMost: 5_000, points: 200 },
        { atMost: 15_000, points: 160 },
        { atMost: 30_000, points: 110 },
        { atMost: 55_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: 1 when replicationHealth equals
      // "throughput-matched" is false (i.e. not the durable fix), 0
      // when it is — measureDimension returns 1 for a non-match under
      // finalStringNotEquals. The `atMost: 0` band (measured 0, meaning
      // the field DOES equal "throughput-matched") awards full marks;
      // every other state (reads-isolated, backlogged, or still
      // unresolved) falls to the lower fallback band.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "replicationHealth", value: "throughput-matched" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 70 },
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
