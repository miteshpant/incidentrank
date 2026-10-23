import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Split-Brain Incident's scoring configuration.
 *
 * The real correctness signal this scenario models is conflictCount
 * (rules.ts) -- the direct, authored evidence of unresolved divergent
 * writes -- which successCondition already gates on directly. That
 * field alone cannot be banded by the generic scorer at the moment of
 * scoring (there is no closed "finalValueAtMost"-style numeric measure
 * in AuthoredScoringMeasure beyond the fixed set), so, following
 * Distributed Lock Failure's lockSafetyMechanism precedent, this
 * scenario carries a generic string-state field -- writeSafetyMechanism
 * -- that records HOW single-writer safety is currently being
 * maintained, not merely whether it currently holds:
 *
 *   "quorum-enforced"   -- the durable, structural fix. A real majority
 *                           requirement means at most one side can ever
 *                           remain writable during this (or a future)
 *                           partition, with no manual judgment call
 *                           required.
 *   "fenced-correct"    -- the candidate explicitly, correctly fenced
 *                           the non-majority side. Safe right now, but
 *                           relies on the candidate having fenced the
 *                           right region rather than on a structural
 *                           guarantee.
 *   "manual-isolation"  -- safe only because the candidate happened to
 *                           set the other region's access mode to
 *                           read-only/offline. Equally safe right now,
 *                           equally not backed by a structural
 *                           guarantee against a future partition.
 *   "fenced-wrong"       -- the candidate fenced the side that
 *                           structurally held majority, sacrificing
 *                           availability on the wrong side.
 *   "both-isolated"      -- safe but needlessly conservative (zero
 *                           write availability anywhere).
 *   "unresolved"          -- no safety mechanism has engaged; covers
 *                           both the untouched baseline AND the active
 *                           dual-leader trap.
 *
 * dataIntegrity bands on finalStringEquals("quorum-enforced") generically
 * (packages/scenarios/src/authoring/score.ts) -- the structural fix
 * scores full marks; every manually-achieved single-writer state
 * ("fenced-correct"/"manual-isolation") scores a real but lower band;
 * every other value (including "both-isolated", "fenced-wrong", and
 * "unresolved" -- which covers the dual-leader trap) scores the lowest
 * band. This directly expresses the batch's binding requirement
 * (phase6b.md section 37): the dual-leader state can never reach the
 * top dataIntegrity band regardless of how healthy
 * regionAWriteAvailability/regionBWriteAvailability read, because
 * availability is never part of this measure at all.
 */
export const SPLIT_BRAIN_INCIDENT_SCORING: AuthoredScoringConfig = {
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
        { atMost: 3_000, points: 200 },
        { atMost: 10_000, points: 160 },
        { atMost: 25_000, points: 110 },
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: 1 (full marks) only when
      // writeSafetyMechanism === "quorum-enforced"; every other value
      // -- including both manually-achieved single-writer states, the
      // wrong-region fence, the overly conservative both-isolated
      // state, and the unresolved/dual-leader trap -- scores a lower
      // band. No scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "writeSafetyMechanism", value: "quorum-enforced" },
      bands: [
        { atMost: 0, points: 60 },
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
