import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Authorization Policy Rollout Failure's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d3.md section 16's binding sanity checks for this scenario
 * class): any path with unauthorized access must score materially
 * worse than baseline even if availability/recovery metrics look
 * excellent, since fail-open-all makes requestSuccessRate near-perfect
 * while being the single worst available action. The generic scorer's
 * literal "dataIntegrity" measure always returns 0 (see score.ts's
 * measureDimension) and there is no numeric-threshold penalty measure
 * in the generic scorer, so this dimension uses `penalties` mode
 * against authorizationStatus (the single authoritative correctness
 * summary) and enforcementPosture (which resource classes are
 * currently protected).
 */
export const AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to THIS scenario's real authored
      // timeline, not a generic availability-incident clock (same
      // calibration principle as Ledger Reconciliation Divergence's
      // scoring.ts): the absolute fastest a candidate can EVER reach
      // genuine full convergence (converged-safe) is
      // CONVERGENCE_FULLY_DONE_MS - REGRESSION_ONSET_MS = 540s, even
      // when every control is set correctly in the first few seconds —
      // cache convergence is a real, non-skippable elapsed-time
      // mechanism (phase6d3.md's required recovery lag), not a
      // function of how fast the candidate acts. The top band must
      // therefore comfortably include ~540s, or the scenario would
      // structurally penalize its own best-possible optimal resolution
      // relative to the much-faster-to-reach acceptable tier (see
      // dataIntegrity's safe-degraded penalty note below for why that
      // combination previously let acceptable outscore optimal).
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 560, points: 300 },
        { atMost: 700, points: 260 },
        { atMost: 900, points: 200 },
        { atMost: 1_200, points: 130 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 700, points: 160 },
        { atMost: 1_400, points: 110 },
        { atMost: 2_600, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode against two closed-enum
      // string-state fields. A fully converged-safe path with
      // enforcementPosture fail-closed-all keeps the full 200 points.
      // Any path that ever shows authorizationStatus
      // "unauthorized-access-active" (fail-open-all or the
      // allow-affected-cohort override, live, right now) loses the vast
      // majority of this dimension's credit — this is the scenario's
      // required "unsafe security/correctness path must not score near
      // optimal" guarantee, independent of how good availability looks
      // in the SAME final state. The historical-scar converged path
      // (converged-safe-historical-scar) reads authorizationStatus
      // "converged-safe" at scoring time — exactly like the clean
      // optimal path — because dataIntegrity, by design, scores the
      // FINAL safety of the handed-back configuration; the permanent
      // historical count itself is a candidate-visible, non-erased
      // metric but is intentionally not re-penalized a second time
      // here once the live state is genuinely safe, to avoid double-
      // counting the same fail-open-all penalty this dimension already
      // applies at the moment fail-open-all is actually in effect.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "regressed" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "fixed-converging" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          // Deliberately a substantial deduction, not a token one: the
          // acceptable tier reaches its (looser) completion bar much
          // faster on the clock than optimal's real cache-convergence
          // wait, which would otherwise let recovery/customerImpact's
          // speed-based bands alone make "acceptable" outscore
          // "optimal" — see phase6d3.md section 16's binding "acceptable
          // does not accidentally dominate optimal without semantic
          // reason." This penalty is what keeps the full, fully-
          // converged resolution strictly ahead for the right reason
          // (data/authorization correctness, not an arbitrary clock
          // tie-breaker), while still scoring far better than any
          // unauthorized-access-active path.
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "safe-degraded" },
          atLeast: 1,
          subtractPoints: 110,
        },
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "unauthorized-access-active" },
          atLeast: 1,
          subtractPoints: 185,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.1, points: 150 },
        { atMost: 0.25, points: 115 },
        { atMost: 0.45, points: 80 },
        { atMost: 0.65, points: 45 },
        { points: 15 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1.2, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
      ],
    },
  ],
};
