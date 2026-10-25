import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Consistency vs Availability Incident's scoring configuration.
 *
 * The real correctness signal this scenario models is
 * balanceCorrectnessViolations (rules.ts) -- the direct, authored
 * evidence of balance writes accepted without cross-region confirmation
 * -- which successCondition already gates on directly. That field alone
 * cannot be banded by the generic scorer's fixed numeric measures, so,
 * following Split-Brain Incident's writeSafetyMechanism precedent, this
 * scenario carries a generic string-state field -- balanceSafetyMechanism
 * -- that records HOW balance-write correctness is currently being
 * protected, not merely whether it currently holds:
 *
 *   "quorum-confirmed"      -- strong mode backed by a real cross-region
 *                               quorum requirement. The durable,
 *                               structurally safe choice.
 *   "single-region-routed"  -- all writes forced onto one named region.
 *                               Also structurally safe, at an
 *                               availability/concentration cost.
 *   "relaxed-unsafe"        -- the one genuinely unsafe move: balance
 *                               consistency relaxed.
 *   "quorum-misconfigured"  -- balance mode still reads "strong" but the
 *                               quorum requirement backing it was
 *                               silently removed.
 *   "unresolved"            -- the untouched baseline/trap default.
 *
 * A single finalStringEquals measure can only compare against one
 * target value, so this scenario bands on
 * finalStringEquals("quorum-confirmed") directly: full marks only for
 * the real structural fix; the lowest band for every other value --
 * which covers the also-safe-right-now "single-region-routed" choice,
 * both unsafe mechanisms ("relaxed-unsafe", "quorum-misconfigured"),
 * and the untouched baseline ("unresolved") alike. This correctly keeps
 * every unsafe value out of the top band; the real discrimination
 * between "single-region-routed" (safe) and the two unsafe mechanisms
 * is instead carried by successCondition's direct gate on
 * balanceCorrectnessViolations (only the two unsafe mechanisms ever
 * produce a nonzero count), so a candidate who reaches
 * single-region-routed is still Finish-eligible at the optimal tier,
 * just scored one Data Integrity band below the structural quorum fix.
 * No scenario-specific scorer code; the generic engine's existing
 * finalStringEquals measure drives this entirely.
 */
export const CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 250 },
        { atMost: 240, points: 190 },
        { atMost: 360, points: 130 },
        { atMost: 540, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      // Bands deliberately tight at the top: this scenario's two
      // optimal strategies (A: consistency everywhere at 300 USD/min
      // revenue loss vs. B: differentiated, catalog relaxed, at 160
      // USD/min) must land in genuinely different bands over a typical
      // few-minute resolution window, so Strategy B's real,
      // business-relevant availability advantage shows up as a higher
      // score, not an identical one.
      bands: [
        { atMost: 150, points: 200 },
        { atMost: 400, points: 170 },
        { atMost: 1_200, points: 130 },
        { atMost: 4_000, points: 90 },
        { atMost: 12_000, points: 50 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: full marks only when
      // balanceSafetyMechanism === "quorum-confirmed" (the durable
      // structural fix); a real but lower band for "single-region-
      // routed" (also safe right now, but concentrates all traffic
      // instead of a cross-region structural guarantee); the lowest
      // band for every other value, including both unsafe mechanisms
      // and the untouched baseline. No scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "balanceSafetyMechanism", value: "quorum-confirmed" },
      bands: [
        { atMost: 0, points: 50 },
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
