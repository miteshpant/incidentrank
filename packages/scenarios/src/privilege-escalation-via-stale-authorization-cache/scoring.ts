import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Privilege Escalation via Stale Authorization Cache's scoring
 * configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * section 11's binding security-QA requirement): a path where
 * authorizationStatus ever reads "stale-grant-active" must score
 * materially worse than every other non-optimal path, even though that
 * same path shows the BEST availability metrics in the entire scenario
 * (see rules.ts's fail-open-stale-grant-* family — requestSuccessRate
 * sits at its ceiling of 99.9 in exactly these states, identical to the
 * fully-converged OPTIMAL state). The generic scorer's literal
 * "dataIntegrity" measure always returns 0 (score.ts's
 * measureDimension), so this dimension uses `penalties` mode against
 * authorizationStatus's closed string enum — the same technique
 * Identity Platform Degradation and Authorization Policy Rollout
 * Failure use for their own correctness dimensions.
 *
 * reliability gates primarily on fleetCacheConvergenceStatus ===
 * "converged" (the genuine full-convergence marker), separately
 * penalizing "stale-grant-active" authorizationStatus further and the
 * "unverified" convergence status, so an acceptable-tier Finish, a
 * security violation, and the assumed-converged sequencing trap all
 * lose real, distinct credit here.
 */
export const PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are tuned against this scenario's real authored
      // timeline (timed-events.ts): the fastest a genuine ACCEPTABLE-tier
      // Finish can be sustained-eligible is shortly after
      // REVOCATION_ONSET_MS (source-of-truth-required engaged
      // immediately, held for the 30s sustain window) — roughly 50-70s
      // after incident start — while CONVERGENCE_FULLY_DONE_MS (440s
      // offset from onset) anchors the fastest genuine OPTIMAL-tier
      // Finish at roughly 440 + 30 (sustain) = ~470s. Acceptable's
      // fastest reachable band (<=90 -> 300) and optimal's fastest
      // reachable band (<=600 -> 270) are a deliberately SMALL gap —
      // this dimension rewards genuine recovery speed honestly for
      // whichever tier a candidate reaches, and does not by itself try
      // to make optimal "win" on recovery alone. The dataIntegrity/
      // reliability dimensions below carry the real weight of making
      // optimal's TOTAL exceed acceptable's TOTAL despite acceptable's
      // legitimate recovery/customerImpact speed advantage — see the
      // score-sanity audit in definition.ts.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 300, points: 280 },
        { atMost: 600, points: 270 },
        { atMost: 900, points: 140 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 1_200, points: 150 },
        { atMost: 3_000, points: 90 },
        { atMost: 7_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Primary security/correctness gate. A path where
      // authorizationStatus has ever read "stale-grant-active" loses
      // the vast majority of this dimension's points — deliberately set
      // well below even the plain "revoked-not-converged" baseline
      // penalty, since a real, cumulative stale-privilege-grant
      // violation is strictly worse than simply not having fixed the
      // incident yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "revoked-not-converged" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "safe-degraded" },
          atLeast: 1,
          subtractPoints: 50,
        },
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "stale-grant-active" },
          atLeast: 1,
          subtractPoints: 185,
        },
      ],
    },
    {
      // Primary gate: fleetCacheConvergenceStatus === "converged" is
      // the ONLY value meaning "the fleet has fully converged on the
      // revocation" — the genuine full-convergence marker reachable
      // exclusively via converged-safe-verified in rules.ts. Every
      // other value (including "converging", a real but intentionally
      // incomplete state) loses a large, deliberate amount of credit
      // here — NOT because converging is unsafe (it is not; dataIntegrity
      // above does not penalize it at all), but because reliability
      // specifically measures "is the whole system, as a system,
      // actually fully back to normal" and converging-but-not-converged
      // by definition is not. This measure (rather than
      // criticalTimeRatio) is deliberately used here because
      // criticalTimeRatio's denominator collapses to a very small
      // number for any acceptable-tier Finish that resolves almost
      // immediately after incident start, producing ratios that
      // spuriously exceed 1.0 and fail to discriminate acceptable from
      // optimal at all — mirroring Identity Platform Degradation's and
      // Authorization Policy Rollout Failure's identical reasoning for
      // avoiding a raw ratio measure on their own optimal-vs-acceptable
      // gates.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "fleetCacheConvergenceStatus", value: "converged" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "authorizationStatus", value: "stale-grant-active" },
          atLeast: 1,
          subtractPoints: 35,
        },
        // Isolates the assumed-converged sequencing trap —
        // fleetCacheConvergenceStatus reads "unverified" only when the
        // candidate has broadly assumed convergence without ever
        // engaging convergenceVerification, never merely because
        // convergence is still in progress ("converging" is a distinct
        // value). Deliberately sized so it still shows up even stacked
        // on top of the "not converged" penalty above (150 - 130 - 20 =
        // 0 exactly; the plain, still-converging baseline instead keeps
        // the 20 points the "not converged" penalty alone leaves on the
        // table), rather than being swallowed by an already-maxed-out
        // penalty total.
        {
          measure: { type: "finalStringEquals", field: "fleetCacheConvergenceStatus", value: "unverified" },
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
        { atMost: 0.25, points: 80 },
        { atMost: 0.5, points: 55 },
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
