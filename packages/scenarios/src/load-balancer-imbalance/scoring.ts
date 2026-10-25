import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Load Balancer Imbalance's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept, but it does have a real,
 * candidate-visible "fixed vs. forcibly reset" distinction
 * (imbalanceRootCause, set by rules.ts): the optimal path actually
 * corrects the routing mechanism (balancing strategy or sticky-session
 * policy), while the acceptable path (connection draining) only forces
 * a one-time reset of a mechanism that remains unchanged. That
 * distinction is honestly integrity-adjacent — "is the routing
 * mechanism itself sound, or only its current symptom cleared" — so
 * dataIntegrity penalizes on it generically via the string-state
 * measure (same closed measure type Missing Database Index's
 * orderHistoryQueryHealth and Kafka Partition Skew's orderingMode
 * already use), stacking an additional, larger penalty specifically
 * for the required-trap signature (capacity added without touching the
 * pinning mechanism) rather than tying optimal/acceptable/trap at one
 * flat catch-all band.
 */
export const LOAD_BALANCER_IMBALANCE_SCORING: AuthoredScoringConfig = {
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
      // Standard reliability measure: how much of the attempt's
      // duration was spent in a critical state. A never-resolved
      // baseline (critical for its entire duration) or a harmful trap
      // (critical throughout, with instance count raised on top) both
      // correctly score low here — unlike a string-state check against
      // "capacity-added" alone, this also penalizes a candidate who
      // simply never fixed anything, closing the gap where baseline
      // would otherwise earn full reliability credit purely because it
      // never happened to match one specific trap's string value.
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 15 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 115 },
        { atMost: 0.5, points: 80 },
        { atMost: 0.7, points: 45 },
        { points: 15 },
      ],
    },
    {
      // "Is the routing mechanism itself fixed, or only its current
      // symptom cleared" — dataIntegrity starts at maxPoints and
      // subtracts for each distinct way the final state falls short of
      // "rebalanced": a smaller penalty if the mechanism was never
      // touched at all (unresolved/harmful, acceptable's forced-reset
      // included), and an additional, larger penalty specifically for
      // the required-trap signature (imbalanceRootCause ===
      // "capacity-added" — instances/weights raised without touching
      // the pinning mechanism), so falling for that specific trap scores
      // strictly worse than simply not having fixed anything yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "imbalanceRootCause", value: "rebalanced" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "imbalanceRootCause", value: "capacity-added" },
          atLeast: 1,
          subtractPoints: 60,
        },
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
