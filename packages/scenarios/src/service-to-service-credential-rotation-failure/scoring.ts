import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Service-to-Service Credential Rotation Failure's scoring
 * configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase-6e-strategy-spec.md section 11's binding security-QA
 * requirement): a path where rotationSafetyStatus ever reads "bypassed"
 * must score materially worse than every other non-optimal path, even
 * though that same path shows the BEST serviceToServiceCallSuccessRate
 * in the entire scenario (see rules.ts's bypass-* family). The generic
 * scorer's literal "dataIntegrity" measure always returns 0 (score.ts's
 * measureDimension), so this dimension uses `penalties` mode against
 * rotationSafetyStatus's closed string enum — the same technique
 * Identity Platform Degradation and Authorization Policy Rollout
 * Failure use for their own correctness dimensions.
 *
 * reliability gates primarily on rotationSafetyStatus reaching a
 * genuinely-safe terminal state ("fully-rotated" or "safe-overlap"),
 * separately penalizing "bypassed" further, so a security violation
 * loses real, distinct credit on this dimension too — never merely a
 * single penalty hidden inside dataIntegrity alone.
 */
export const SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are calibrated against this scenario's real
      // authored timeline (timed-events.ts): the fastest a genuine
      // OPTIMAL-tier Finish can be sustained-eligible is reachable
      // within the first ~1-2 minutes after rotation start (activate ->
      // verify all cohorts -> revoke, no elapsed-time wait required on
      // the pure safe path, since recovery-lag only applies to the
      // ROLLBACK path, not the never-broken staged path), held for the
      // 20s sustain window. A candidate who instead triggers a
      // premature-revocation gap and must roll back pays the real
      // rollback-propagation elapsed-time cost
      // (ROLLBACK_PROPAGATION_FULLY_DONE_MS - ROTATION_STARTED_MS, up
      // to several minutes depending on when the gap was created) —
      // reflected honestly here as a slower recovery time, not
      // penalized a second time elsewhere.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 120, points: 300 },
        { atMost: 300, points: 260 },
        { atMost: 480, points: 200 },
        { atMost: 720, points: 120 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 150, points: 200 },
        { atMost: 500, points: 150 },
        { atMost: 1_200, points: 90 },
        { atMost: 2_500, points: 40 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode against the single
      // authoritative string-state field. A fully-rotated-safe path
      // keeps the full 200 points. Any path that ever shows
      // rotationSafetyStatus "bypassed" loses the vast majority of
      // this dimension's credit — the scenario's required "unsafe
      // security path must not score near optimal" guarantee,
      // independent of how good the call-success-rate metric looks in
      // the SAME final state.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "rotationSafetyStatus", value: "not-started" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "rotationSafetyStatus", value: "premature-gap" },
          atLeast: 1,
          subtractPoints: 55,
        },
        {
          measure: { type: "finalStringEquals", field: "rotationSafetyStatus", value: "rolled-back-safe" },
          atLeast: 1,
          subtractPoints: 10,
        },
        {
          measure: { type: "finalStringEquals", field: "rotationSafetyStatus", value: "safe-overlap" },
          atLeast: 1,
          subtractPoints: 5,
        },
        {
          // Deliberately the full 200 (floored at 0), not merely a
          // large fraction: the score-sanity audit in definition.ts
          // (and this scenario's test suite) requires the bypass path
          // to score strictly worse in TOTAL than even the premature-
          // revocation gap it "fixes," despite bypass's dramatically
          // better customerImpact/revenue numbers — a smaller
          // dataIntegrity deduction left total favoring bypass by a
          // comfortable margin. Zeroing dataIntegrity entirely is what
          // makes "availability-good / security-bad must never score
          // as safe" hold in TOTAL, not merely on this one dimension.
          measure: { type: "finalStringEquals", field: "rotationSafetyStatus", value: "bypassed" },
          atLeast: 1,
          subtractPoints: 200,
        },
      ],
    },
    {
      // Primary gate: rotationSafetyStatus === "fully-rotated" is the
      // ONLY value meaning "the entire fleet has verified the new
      // credential AND the old credential has been safely revoked" —
      // the genuine full-recovery marker. "safe-overlap" (cohorts
      // verified but old credential not yet cleaned up) is real and
      // safe but intentionally incomplete as a SYSTEM state, so it
      // loses real credit here even though dataIntegrity barely
      // penalizes it. "bypassed" loses the most, on top of
      // dataIntegrity's own penalty.
      dimension: "reliability",
      maxPoints: 150,
      terminalOverrides: { failed: 0, unresolved: 0 },
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "rotationSafetyStatus", value: "fully-rotated" },
          atLeast: 1,
          subtractPoints: 95,
        },
        {
          measure: { type: "finalStringEquals", field: "rotationSafetyStatus", value: "bypassed" },
          atLeast: 1,
          subtractPoints: 40,
        },
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
        { atMost: 1.0, points: 25 },
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
