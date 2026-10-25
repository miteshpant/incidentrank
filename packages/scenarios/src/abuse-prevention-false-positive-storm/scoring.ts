import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Abuse-Prevention False Positive Storm's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase-6e-strategy-spec.md section 11's explicit security-QA
 * requirement): a path where abuseProtectionStatus ever reads
 * "protection-bypassed" must score materially worse than every other
 * non-optimal path, even though that same path shows the BEST
 * legitimate-user availability metrics in the entire scenario (see
 * rules.ts's rate-limiter-disabled-* family — legitimateUserSuccessRate
 * is at its highest in exactly these states). The generic scorer's
 * literal "dataIntegrity" measure always returns 0 (score.ts's
 * measureDimension), so this dimension uses `penalties` mode against
 * abuseProtectionStatus's closed string enum — the same technique
 * identity-platform-degradation and authorization-policy-rollout-
 * failure use for their own correctness dimensions.
 *
 * reliability gates primarily on abuseProtectionStatus === "fully-
 * restored" (the genuine full-recovery marker), separately penalizing
 * "protection-bypassed" further, so a bounded-but-incomplete
 * acceptable-tier Finish and a real security violation both lose real,
 * distinct credit here.
 *
 * dataIntegrity and reliability both floor at 0 for any
 * "protection-bypassed" final state (200/150 of penalties applied
 * respectively, clamped at 0 by score.ts's applyPenalties) — a
 * deliberate, maximal floor, not a token deduction. This combined
 * dataIntegrity+reliability gap (110 points at the zero-action
 * baseline's "false-positives-active" state vs 0 at "protection-
 * bypassed") is sized large enough, together with customerImpact's
 * band widths above, to keep the never-resolved baseline's TOTAL
 * ahead of the never-resolved bypass path's TOTAL despite bypass
 * showing a dramatically better raw revenueLossUsd (near-zero, since
 * legitimate-user availability is genuinely excellent while bypass is
 * active) — see the score-sanity audit in the test suite's "harmful
 * path ... scores WORSE ... than the baseline" case, which asserts
 * this explicitly. This is the scenario's binding "availability-good /
 * security-bad must never score as safe" requirement, enforced on the
 * TOTAL, not just on the individual dataIntegrity/reliability
 * dimensions in isolation.
 */
export const ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are deliberately tuned against this scenario's
      // real authored timeline (timed-events.ts): the fastest a
      // genuine ACCEPTABLE-tier Finish can be sustained-eligible is
      // ~30-55s after onset (exemption + trust scoring, held for the
      // 20s sustain window), while the fastest a genuine OPTIMAL-tier
      // Finish can be sustained-eligible via targeted rollback is
      // similarly fast (~30-55s) since rollback requires no elapsed-
      // time gate at all — only the patched-forward-fix alternate path
      // requires waiting for PATCHED_RULE_AVAILABLE_MS (390s after
      // onset). Both tiers' fastest-reachable bands are therefore
      // close together, mirroring identity-platform-degradation's
      // calibration approach: this dimension rewards genuine recovery
      // speed honestly for whichever tier a candidate reaches, and
      // does not by itself try to make optimal "win" on recovery
      // alone. The dataIntegrity/reliability dimensions below carry
      // the real weight of keeping optimal's TOTAL ahead for the right
      // reason (data/abuse-containment correctness, not a clock
      // tie-breaker) — see the score-sanity audit in the test suite.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 70, points: 300 },
        { atMost: 120, points: 270 },
        { atMost: 450, points: 230 },
        { atMost: 700, points: 120 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 1_200, points: 150 },
        { atMost: 3_300, points: 90 },
        { atMost: 7_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Primary security/correctness gate. A path where
      // abuseProtectionStatus has ever read "protection-bypassed"
      // loses the vast majority of this dimension's points —
      // deliberately set well below even the plain "false-positives-
      // active" baseline penalty, since real, cumulative abuse
      // exposure is strictly worse than simply not having fixed the
      // incident yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "abuseProtectionStatus", value: "false-positives-active" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "abuseProtectionStatus", value: "targeted-fix-applied" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "abuseProtectionStatus", value: "protection-bypassed" },
          atLeast: 1,
          subtractPoints: 200,
        },
      ],
    },
    {
      // Primary gate: abuseProtectionStatus === "fully-restored" is
      // the ONLY value meaning "the detection rule has genuinely been
      // fixed and no bypass was ever used" — the real full-recovery
      // marker reachable exclusively via the two fix rules in
      // rules.ts. Every other value (including "targeted-fix-applied",
      // a real but intentionally incomplete tradeoff) loses a large,
      // deliberate amount of credit here — NOT because the exemption
      // is unsafe (it is not; dataIntegrity above barely penalizes it)
      // but because reliability specifically measures "is the
      // underlying rule defect itself actually resolved," and the
      // exemption by definition has not resolved it yet.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "abuseProtectionStatus", value: "fully-restored" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "abuseProtectionStatus", value: "protection-bypassed" },
          atLeast: 1,
          subtractPoints: 45,
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
