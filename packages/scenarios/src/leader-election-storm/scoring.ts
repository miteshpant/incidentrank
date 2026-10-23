import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Leader Election Storm's scoring configuration. This scenario has no
 * data-loss/duplication concept of its own, but it does have a real,
 * candidate-visible "proportionate fix vs. reduced-redundancy tradeoff
 * vs. never actually fixed" distinction (electionStabilityMechanism,
 * set by rules.ts): the optimal path (margin-fixed) keeps full quorum
 * fault tolerance intact, the acceptable path (node-isolated, or a
 * genuine post-crash margin-fixed settlement) is safe right now but has
 * spent the cluster's remaining redundancy margin to get there, and the
 * excessive-timeout trap never earns either label even when quiet. That
 * distinction is integrity-adjacent in the same sense Missing Database
 * Index's orderHistoryQueryHealth and Distributed Lock Failure's
 * lockSafetyMechanism are — "is the system's resilience capability
 * intact, or only its symptoms currently quiet" — so dataIntegrity
 * bands on it generically via finalStringEquals, rather than tying
 * optimal/acceptable at a flat catch-all band.
 */
export const LEADER_ELECTION_STORM_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 240, points: 190 },
        { atMost: 420, points: 130 },
        { atMost: 600, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 8_000, points: 200 },
        { atMost: 22_000, points: 160 },
        { atMost: 45_000, points: 110 },
        { atMost: 75_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure (packages/scenarios/src/authoring/
      // score.ts) comparing electionStabilityMechanism against
      // "node-isolated". measureDimension returns 1 when it matches
      // (the acceptable path: redundancy margin spent, not restored)
      // and 0 otherwise (the optimal "margin-fixed" path, and every
      // still-unresolved/harmful path alike) — so the `atMost: 0` band
      // awards full marks to "full redundancy margin intact or
      // incident simply unresolved," and only the node-isolated
      // acceptable path falls through to the lower fallback band. No
      // scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "electionStabilityMechanism", value: "node-isolated" },
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
