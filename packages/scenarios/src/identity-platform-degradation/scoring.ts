import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Identity Platform Degradation's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d3.md section 22's explicit security-QA requirement): a path
 * where authSecurityStatus ever reads "compromised" must score
 * materially worse than every other non-optimal path, even though that
 * same path shows the BEST availability metrics in the entire scenario
 * (see rules.ts's mfa-bypass-all-* family — lowRiskLoginSuccessRate /
 * highRiskLoginSuccessRate are at their highest in exactly these
 * states). The generic scorer's literal "dataIntegrity" measure always
 * returns 0 (score.ts's measureDimension), so this dimension uses
 * `penalties` mode against authSecurityStatus's closed string enum —
 * the same technique Ledger Reconciliation Divergence and API
 * Migration Dual-Write Failure use for their own correctness
 * dimensions.
 *
 * reliability gates primarily on authSecurityStatus === "restored" (the
 * genuine full-recovery marker), separately penalizing "compromised"
 * further and the pressure-transfer trap's systemPressureSeverity ===
 * "amplified" marker, so a bounded-but-incomplete acceptable-tier
 * Finish, a security violation, and the pressure-transfer trap all lose
 * real, distinct credit here.
 */
export const IDENTITY_PLATFORM_DEGRADATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are deliberately tuned against this scenario's
      // real authored timeline (timed-events.ts), mirroring API
      // Migration Dual-Write Failure's calibration approach exactly:
      // the fastest a genuine ACCEPTABLE-tier Finish can be
      // sustained-eligible is ~50-80s after incident start (bounded-
      // degrade + usable risk engine + non-bypassed privileged mode,
      // held for the 20s sustain window), while RELIEF_WINDOW_1/2/
      // FULLY_RELIEVED_MS are anchored AFTER MFA_PROVIDER_RECOVERED_MS
      // (690s), so the fastest a genuine OPTIMAL-tier Finish can be
      // sustained-eligible is ~690 + 540 (fully-relieved offset) + 20
      // (sustain) = ~1_250s. Acceptable's fastest reachable band
      // (<=90 -> 300) and optimal's fastest reachable band
      // (<=1_400 -> 260) are only 40 points apart — deliberately a
      // SMALL gap, not a large one: this dimension rewards genuine
      // recovery speed honestly for whichever tier a candidate
      // reaches, and does not by itself try to make optimal "win" on
      // recovery alone. The dataIntegrity/reliability dimensions below
      // carry the real weight of making optimal's TOTAL exceed
      // acceptable's TOTAL despite acceptable's legitimate
      // recovery/customerImpact speed advantage — see the score-sanity
      // audit in definition.ts proving the combined gap is enough.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 400, points: 280 },
        { atMost: 1_400, points: 260 },
        { atMost: 1_800, points: 140 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 500, points: 200 },
        { atMost: 1_500, points: 150 },
        { atMost: 4_000, points: 90 },
        { atMost: 9_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Primary security/correctness gate. A path where
      // authSecurityStatus has ever read "compromised" loses the vast
      // majority of this dimension's points — deliberately set well
      // below even the "unprotected"/"fail-closed" baseline penalty,
      // since a real, cumulative MFA-bypass violation is strictly
      // worse than simply not having fixed the incident yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "authSecurityStatus", value: "unprotected" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "authSecurityStatus", value: "fail-closed" },
          atLeast: 1,
          subtractPoints: 50,
        },
        {
          measure: { type: "finalStringEquals", field: "authSecurityStatus", value: "bounded-degraded" },
          atLeast: 1,
          subtractPoints: 125,
        },
        {
          measure: { type: "finalStringEquals", field: "authSecurityStatus", value: "compromised" },
          atLeast: 1,
          subtractPoints: 185,
        },
      ],
    },
    {
      // Primary gate: authSecurityStatus === "restored" is the ONLY
      // value meaning "the MFA Provider has fully recovered and
      // mandatory MFA is fully back in effect for everyone" — the
      // genuine full-recovery marker reachable exclusively via the
      // optimal/fully-relieved family in rules.ts. Every other value
      // (including "bounded-degraded", a real but intentionally
      // incomplete tradeoff) loses a large, deliberate amount of
      // credit here — NOT because bounded-degrade is unsafe (it is
      // not; dataIntegrity above barely penalizes it), but because
      // reliability specifically measures "is the whole system, as a
      // system, actually fully back to normal" and bounded-degrade by
      // definition is not. This measure (rather than criticalTimeRatio)
      // is deliberately used here because criticalTimeRatio's
      // denominator collapses to a very small number for any
      // acceptable-tier Finish that resolves almost immediately after
      // incident start, producing ratios that spuriously exceed 1.0
      // and fail to discriminate acceptable from optimal at all (see
      // the score-sanity audit in definition.ts) — mirroring API
      // Migration Dual-Write Failure's identical reasoning for
      // avoiding a raw ratio measure on its own optimal-vs-acceptable
      // gate.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "authSecurityStatus", value: "restored" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "authSecurityStatus", value: "compromised" },
          atLeast: 1,
          subtractPoints: 35,
        },
        // Isolates the pressure-TRANSFER trap — systemPressureSeverity
        // is a dedicated string field (metrics.ts) that only ever
        // reads "amplified" when a candidate choice actively made both
        // the Session Store and the MFA Provider worse, never merely
        // because pressure is high on its own. Deliberately sized so
        // it still shows up even stacked on top of the "not restored"
        // penalty above (150 - 130 - 20 = 0 exactly; the plain,
        // non-amplified baseline instead keeps the 20 points the "not
        // restored" penalty alone leaves on the table), rather than
        // being swallowed by an already-maxed-out penalty total.
        {
          measure: { type: "finalStringEquals", field: "systemPressureSeverity", value: "amplified" },
          atLeast: 1,
          subtractPoints: 20,
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
