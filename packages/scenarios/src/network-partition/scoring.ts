import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Network Partition's scoring configuration.
 *
 * The real correctness signal this scenario models is
 * ledgerConsistencyViolationCount (rules.ts) -- the direct, authored
 * evidence of divergent/conflicting ledger writes -- which
 * successCondition already gates on directly. That field alone cannot be
 * banded by the generic scorer at the moment of scoring (there is no
 * closed "finalValueAtMost"-style numeric measure in
 * AuthoredScoringMeasure beyond the fixed set), so, following Split-Brain
 * Incident's writeSafetyMechanism precedent, this scenario carries a
 * generic string-state field -- ledgerSafetyMechanism -- that records HOW
 * ledger write safety is currently being maintained, not merely whether
 * it currently holds:
 *
 *   "single-region-routed" -- the durable, structural fix. Ledger writes
 *                              always resolve to one named authoritative
 *                              region regardless of which region a
 *                              request lands in, so this stays safe
 *                              through this (or a future) partition too,
 *                              with no manual judgment call required.
 *   "region-isolated"      -- safe only because the candidate happened to
 *                              manually isolate (read-only/isolated) the
 *                              OTHER region. Equally safe right now,
 *                              equally not backed by a structural
 *                              guarantee against a future partition.
 *   "both-isolated"         -- safe but needlessly conservative (zero
 *                              ledger write availability anywhere).
 *   "unresolved"            -- no safety mechanism has engaged; covers
 *                              both the untouched baseline AND the active
 *                              dual-ledger-write trap.
 *
 * dataIntegrity bands on finalStringEquals("single-region-routed")
 * generically (packages/scenarios/src/authoring/score.ts) -- the
 * structural fix scores full marks; the manually-achieved
 * "region-isolated" state scores a real but lower band; every other
 * value (including "both-isolated" and "unresolved" -- which covers the
 * dual-write trap) scores the lowest band. This directly expresses the
 * binding requirement that the dual-ledger-write trap can never reach the
 * top dataIntegrity band regardless of how healthy regionAAvailability/
 * regionBAvailability read, because availability is never part of this
 * measure at all.
 */
export const NETWORK_PARTITION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 250 },
        { atMost: 210, points: 190 },
        { atMost: 330, points: 130 },
        { atMost: 510, points: 70 },
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
      // ledgerSafetyMechanism === "single-region-routed"; every other
      // value -- including the manually-achieved region-isolated state,
      // the overly conservative both-isolated state, and the
      // unresolved/dual-write trap -- scores a lower band. No
      // scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "ledgerSafetyMechanism", value: "single-region-routed" },
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
