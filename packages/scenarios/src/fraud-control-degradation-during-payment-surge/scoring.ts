import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Fraud Control Degradation During Payment Surge's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase-6e-strategy-spec.md section 11's explicit security requirement):
 * a path where fraudControlStatus ever reads "compromised" must score
 * materially worse than every other non-optimal path, even though that
 * same path shows the BEST checkout metrics in the entire scenario (see
 * rules.ts's bypass-all-* family — lowRiskTransactionSuccessRate /
 * highRiskTransactionSuccessRate are at their highest in exactly these
 * states, and checkoutSuccessRate/checkoutP99LatencyMs look excellent).
 * The generic scorer's literal "dataIntegrity" measure always returns 0
 * (score.ts's measureDimension), so this dimension uses `penalties`
 * mode against fraudControlStatus's closed string enum — the same
 * technique Identity Platform Degradation and Authorization Policy
 * Rollout Failure use for their own correctness/security dimensions.
 *
 * reliability gates primarily on fraudControlStatus === "restored" (the
 * genuine full-recovery marker), separately penalizing "compromised"
 * further and the queue-pressure-amplification trap's
 * queuePressureSeverity === "amplified" marker, so a bounded-but-
 * incomplete acceptable-tier Finish, a fraud-control violation, and the
 * queue-amplification trap all lose real, distinct credit here.
 */
export const FRAUD_CONTROL_DEGRADATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are deliberately tuned against this scenario's
      // real authored timeline (timed-events.ts), mirroring Identity
      // Platform Degradation's calibration approach exactly: the
      // fastest a genuine ACCEPTABLE-tier Finish can be
      // sustained-eligible is ~50-80s after incident start (bounded-
      // fallback + usable Rules Engine, held for the 20s sustain
      // window), while DRAIN_WINDOW_1/2/FULLY_DRAINED_MS are anchored
      // AFTER RISK_PROVIDER_RECOVERED_MS (690s), so the fastest a
      // genuine OPTIMAL-tier Finish can be sustained-eligible is
      // ~690 + 540 (fully-drained offset) + 20 (sustain) = ~1_250s.
      // Acceptable's fastest reachable band (<=90 -> 300) and
      // optimal's fastest reachable band (<=1_400 -> 260) are only 40
      // points apart — deliberately a SMALL gap, not a large one: this
      // dimension rewards genuine recovery speed honestly for whichever
      // tier a candidate reaches, and does not by itself try to make
      // optimal "win" on recovery alone. The dataIntegrity/reliability
      // dimensions below carry the real weight of making optimal's
      // TOTAL exceed acceptable's TOTAL despite acceptable's legitimate
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
      // fraudControlStatus has ever read "compromised" loses the vast
      // majority of this dimension's points — deliberately set well
      // below even the "unprotected"/"fail-closed" baseline penalty,
      // since a real, cumulative fraud-review-bypass violation is
      // strictly worse than simply not having fixed the incident yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "fraudControlStatus", value: "unprotected" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "fraudControlStatus", value: "fail-closed" },
          atLeast: 1,
          subtractPoints: 50,
        },
        {
          measure: { type: "finalStringEquals", field: "fraudControlStatus", value: "bounded-fallback" },
          atLeast: 1,
          subtractPoints: 125,
        },
        {
          measure: { type: "finalStringEquals", field: "fraudControlStatus", value: "compromised" },
          atLeast: 1,
          subtractPoints: 185,
        },
      ],
    },
    {
      // Primary gate: fraudControlStatus === "restored" is the ONLY
      // value meaning "the External Risk Provider has fully recovered
      // and mandatory fraud review is fully back in effect for
      // everyone" — the genuine full-recovery marker reachable
      // exclusively via the optimal/fully-drained family in rules.ts.
      // Every other value (including "bounded-fallback", a real but
      // intentionally incomplete tradeoff) loses a large, deliberate
      // amount of credit here — NOT because bounded-fallback is unsafe
      // (it is not; dataIntegrity above barely penalizes it), but
      // because reliability specifically measures "is the whole
      // system, as a system, actually fully back to normal" and
      // bounded-fallback by definition is not. This measure
      // (rather than criticalTimeRatio) is deliberately used here
      // because criticalTimeRatio's denominator collapses to a very
      // small number for any acceptable-tier Finish that resolves
      // almost immediately after incident start, producing ratios that
      // spuriously exceed 1.0 and fail to discriminate acceptable from
      // optimal at all (see the score-sanity audit in definition.ts) —
      // mirroring Identity Platform Degradation's identical reasoning
      // for avoiding a raw ratio measure on its own optimal-vs-
      // acceptable gate.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "fraudControlStatus", value: "restored" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "fraudControlStatus", value: "compromised" },
          atLeast: 1,
          subtractPoints: 35,
        },
        // Isolates the queue-pressure-amplification trap —
        // queuePressureSeverity is a dedicated string field
        // (metrics.ts) that only ever reads "amplified" when a
        // candidate choice actively made both review-queue backlog and
        // checkout latency worse, never merely because pressure is
        // high on its own. Deliberately sized so it still shows up
        // even stacked on top of the "not restored" penalty above
        // (150 - 130 - 20 = 0 exactly; the plain, non-amplified
        // baseline instead keeps the 20 points the "not restored"
        // penalty alone leaves on the table), rather than being
        // swallowed by an already-maxed-out penalty total.
        {
          measure: { type: "finalStringEquals", field: "queuePressureSeverity", value: "amplified" },
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
