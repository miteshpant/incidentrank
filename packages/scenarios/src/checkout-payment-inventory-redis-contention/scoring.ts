import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Checkout/Payment/Inventory/Redis parallel reference incident's own
 * scoring configuration (Phase 10F, corrected in Phase 10G). Every
 * dimension uses the same generic, data-driven scorer every other
 * scenario uses (packages/scenarios/src/authoring/score.ts) — zero new
 * scoring logic was added for this scenario, per the binding "zero slug
 * branching" scoring architecture decision.
 *
 * Phase 10G correction: every dimension's maxPoints is the SAME fixed
 * value every scenario in the catalog uses (recovery=300,
 * customerImpact=200, dataIntegrity=200, reliability=150,
 * costEfficiency=100, operationalEfficiency=50 — see
 * validateAuthoredScenario's SCORE_MAX_BY_DIMENSION, packages/scenarios/
 * src/authoring/validate.ts, and validateBuiltInScenario's reuse of the
 * same table for built-ins). Phase 10F originally authored
 * operationalEfficiency at 150 to make the inferior-remediation penalty
 * "feel" larger — this silently violated the fixed-max invariant every
 * org-authored scenario already enforces (built-ins were never checked
 * against it), and surfaced as a genuinely wrong "150 / 50" on the
 * result screen. Band/penalty shapes below are rescaled to the standard
 * ceiling per dimension so the same investigation-quality signal
 * (correlated-then-fixed vs. guessed-fix vs. inferior-remediation)
 * still holds, just within the catalog-standard point budget.
 *
 * Investigation quality/prioritization is scored explicitly via the
 * existing `finalStringEquals` measure against the `diagnosisPath` state
 * value rules.ts authors directly — never inferred from roleInIncident
 * tags, which are reserved for the post-incident narrative only. This is
 * the same mechanism Kafka Partition Skew's orderingMode tradeoff
 * already uses; investigation-quality scoring is a new DIMENSION here,
 * not a new MEASURE in the shared scorer.
 */
export const CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 240 },
        { atMost: 240, points: 180 },
        { atMost: 360, points: 110 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 8_000, points: 200 },
        { atMost: 20_000, points: 150 },
        { atMost: 40_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated Payment + Inventory + Redis before applying
      // the fix ("correlated-then-fixed"), applied the correct fix
      // without demonstrating that correlation ("guessed-fix"), chased
      // one of the two inferior single-service remediations, or did
      // nothing at all. Every value is a literal rules.ts authors by
      // hand — not derived from roleInIncident, not computed by any
      // generic "did they touch root_cause" heuristic.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "diagnosisPath", value: "correlated-then-fixed" },
      bands: [
        { atMost: 0, points: 80 },
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
        { atMost: 0.3, points: 110 },
        { atMost: 0.5, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 60 },
        { atMost: 3, points: 30 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        // Chasing an inferior single-service remediation instead of the
        // shared-dependency fix is explicitly penalized here, in
        // addition to dataIntegrity's own lower band for an incomplete
        // diagnosisPath — operationalEfficiency measures the COST of the
        // wrong actions taken, dataIntegrity measures whether the right
        // diagnosis was ultimately reached; the two are intentionally
        // not the same dimension, mirroring how harmfulChangeCount and
        // a scenario's own data-integrity measure stay independent
        // elsewhere in this codebase. Penalty amounts rescaled from
        // Phase 10F's non-standard 150-point ceiling to this dimension's
        // standard 50-point one (same proportions: ~13%/10%/20% of max).
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
