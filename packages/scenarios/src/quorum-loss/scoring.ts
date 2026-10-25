import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Quorum Loss's scoring configuration.
 *
 * The real correctness signal this scenario models is unsafeWriteCount
 * (rules.ts) -- the direct, authored evidence of writes accepted without
 * genuine majority agreement -- which successCondition already gates on
 * directly. Following Split-Brain Incident's writeSafetyMechanism
 * precedent, this scenario carries a generic string-state field --
 * quorumSafetyMechanism -- that records HOW safety is currently being
 * maintained, not merely whether it currently holds:
 *
 *   "membership-reconfigured" -- the durable, structural fix. Voting
 *                                 membership was shrunk to the nodes
 *                                 actually reachable, restoring a real
 *                                 majority with headroom, independent of
 *                                 whether Node C later also drops.
 *   "structural-refusal"      -- below quorum, but quorumRequirement's
 *                                 strict-majority setting made the
 *                                 leader refuse writes on its own. Safe,
 *                                 but write availability is sacrificed
 *                                 rather than quorum being restored.
 *   "read-only-engaged"        -- below quorum, candidate explicitly
 *                                 engaged read-only mode. Equally safe,
 *                                 equally an availability tradeoff
 *                                 rather than a restoration of quorum.
 *   "unresolved"                -- no safety mechanism has engaged;
 *                                 covers the untouched baseline, the
 *                                 at-the-edge warning state, AND the
 *                                 active below-quorum unsafe-writes trap.
 *
 * dataIntegrity bands on finalStringEquals("membership-reconfigured")
 * generically (packages/scenarios/src/authoring/score.ts) -- the
 * structural fix that actually restores quorum scores full marks; the
 * two safe-but-sacrificed-availability mechanisms score a real but lower
 * band; "unresolved" (including the unsafe-writes trap) scores the
 * lowest band. This directly expresses the binding requirement: the
 * below-quorum unsafe-writes state can never reach the top dataIntegrity
 * band regardless of how healthy writeAvailability reads, because
 * availability is never part of this measure at all.
 */
export const QUORUM_LOSS_SCORING: AuthoredScoringConfig = {
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
        { atMost: 2_000, points: 200 },
        { atMost: 8_000, points: 160 },
        { atMost: 20_000, points: 110 },
        { atMost: 40_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Penalty mode (two independent generic string-state measures, so
      // bands alone cannot express this — bands band exactly one
      // measure). Starts at full marks (200) and subtracts for each
      // matching condition:
      //   - quorumSafetyMechanism !== "membership-reconfigured" (i.e. not
      //     the durable structural fix: covers both manually-achieved
      //     safe-degrade mechanisms AND the unresolved/unsafe-writes
      //     trap alike) subtracts 130, leaving 70 — a real but lower
      //     band for "safe right now, not structurally guaranteed."
      //   - quorumSafetyMechanism === "unsafe-writes-accepted" (the
      //     trap, and ONLY the trap — never the merely-unresolved
      //     baseline, which keeps quorumSafetyMechanism="unresolved")
      //     stacks an additional 130 off, leaving 0. This is what keeps
      //     the correctness-violating trap from ever tying a merely-
      //     unresolved-but-safe baseline: the generic string-state
      //     measure the trap fires on simply isn't present anywhere
      //     else in the state space. No scenario-specific scorer code —
      //     both are the same closed finalStringEquals/finalStringNotEquals
      //     measure types every scenario already uses.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "quorumSafetyMechanism", value: "membership-reconfigured" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "quorumSafetyMechanism", value: "unsafe-writes-accepted" },
          atLeast: 1,
          subtractPoints: 130,
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
