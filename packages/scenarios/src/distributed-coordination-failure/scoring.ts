import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Distributed Coordination Failure's scoring configuration. This
 * scenario's defining correctness signal is ownershipIntegrityMode
 * (set by rules.ts): "reconciled" means the ownership table's own
 * staleness was actually fixed; "reconciled-unfenced" and
 * "fenced-unreconciled" mean exactly one of the two complementary
 * mechanisms is in place (a real, partial, candidate-visible
 * improvement in ownershipConflictCount/missedWorkItemCount/
 * duplicateWorkCompletedCount versus doing nothing); "unresolved"
 * means neither is in place and the full range of unmitigated/harmful
 * states applies. dataIntegrity scores this generically via
 * penalties over two finalStringNotEquals measures — one checking
 * "did the candidate reach fully reconciled+fenced," the other
 * checking "did the candidate apply at least one of the two
 * mechanisms" — so a genuinely safer partial state
 * (reconciled-unfenced/fenced-unreconciled) scores strictly between
 * full safety and doing nothing, never tied with either. Same
 * declarative pattern as Missing Database Index's
 * orderHistoryQueryHealth / Kafka Partition Skew's orderingMode,
 * extended to a three-tier distinction — never a scenario-specific
 * scorer.
 */
export const DISTRIBUTED_COORDINATION_FAILURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 180, points: 250 },
        { atMost: 300, points: 190 },
        { atMost: 480, points: 130 },
        { atMost: 720, points: 70 },
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
      // Penalty mode, starting at full marks (200). Two independent
      // (different-measure) penalties stack additively:
      //   - "not reconciled" fires (measured 1) for every mode except
      //     the fully fixed "reconciled" — subtracts 60.
      //   - "is unresolved" fires (measured 1) only when NEITHER
      //     complementary mechanism was ever applied — subtracts a
      //     further 100.
      // This produces exactly three distinct, candidate-meaningful
      // outcomes instead of a flat reconciled/not-reconciled split:
      //   reconciled                         -> 200 (0 subtracted)
      //   reconciled-unfenced/fenced-unrecon. -> 140 (60 subtracted:
      //                                          a real partial fix)
      //   unresolved (neither mechanism)     ->  40 (60+100
      //                                          subtracted: no
      //                                          correctness gap ever
      //                                          closed)
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "ownershipIntegrityMode", value: "reconciled" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "ownershipIntegrityMode", value: "unresolved" },
          atLeast: 1,
          subtractPoints: 100,
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
