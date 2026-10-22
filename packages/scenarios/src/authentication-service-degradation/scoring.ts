import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Authentication Service Degradation's own scoring configuration — no
 * provider-recovery semantics, reliability weighted on time spent in a
 * critical auth-degradation state generically (criticalTimeRatio). See
 * docs/implementation_plan/phase6.md's scoring-convergence mandate.
 *
 * operationalEfficiency's harmfulChangeCount penalty is set to the full
 * dimension maxPoints at the first tier (subtractPoints: 50 for
 * harmfulChangeCount >= 1) — the harshest penalty structurally possible
 * within the existing six-dimension/1000-point model — reflecting that
 * enabling signatureVerificationBypassEnabled is a severe security
 * regression, not merely an inefficient or wasteful action like this
 * batch's other harmful paths. A single bypass action zeroes this
 * dimension outright.
 */
export const AUTHENTICATION_SERVICE_DEGRADATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 45, points: 300 },
        { atMost: 90, points: 250 },
        { atMost: 150, points: 200 },
        { atMost: 240, points: 140 },
        { atMost: 420, points: 80 },
        { points: 30 },
      ],
    },
    {
      // Bands tightened to this scenario's actual revenue-loss scale —
      // regression test for a bug where the two genuine partial-
      // improvement paths (cache-TTL-only, partial scaling) and the
      // no-action baseline all saturated the same wide top band and tied
      // on customerImpact, despite measurably different revenueLossUsd
      // (baseline accrues at the full degrading rate; both partials
      // accrue at a much lower rate once their mitigation takes hold).
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 600, points: 200 },
        { atMost: 900, points: 165 },
        { atMost: 2_000, points: 130 },
        { atMost: 10_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Unlike every other built-in scenario (which has no duplicate/
      // lost-write modeling and awards full marks via a single catch-all
      // band), this scenario's harmful trap IS a literal data-integrity
      // regression: bypassing signature verification means the system
      // accepts unverified tokens, independent of what the live metrics
      // show. Penalized via the same harmfulChangeCount measure
      // operationalEfficiency already uses — this is the dimension where
      // "accepting unverified tokens" most honestly belongs, not merely
      // an efficiency/waste concern.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [{ measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 200 }],
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
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 65 },
        { atMost: 3, points: 35 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 50 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
