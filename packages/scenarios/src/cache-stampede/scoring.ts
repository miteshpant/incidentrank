import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cache Stampede's own scoring configuration — no provider-recovery
 * semantics (this scenario has no external-provider timeline), reliability
 * weighted on time spent in a critical origin-overload state generically
 * (criticalTimeRatio), and costEfficiency banded more forgivingly than
 * Kafka Consumer Lag's since legitimate capacity headroom (moderate pool
 * scaling) is a real, if partial, mitigation here rather than pure waste.
 * See docs/implementation_plan/phase6.md's scoring-convergence mandate.
 *
 * customerImpact and costEfficiency are tuned together as a pair (see each
 * dimension's own comment below): recovery(300pts) and reliability(150pts)
 * both zero out identically via terminalOverrides.unresolved for EVERY
 * non-resolved outcome — baseline (did nothing), the harmful lower-TTL
 * trap, and both partial pool-scaling paths all end "unresolved" within
 * this scenario's short failure window, so those 450 points carry zero
 * signal between them. customerImpact and costEfficiency are therefore
 * the only two dimensions that can distinguish "visibly reduced live
 * harm, even without a full resolve" from "did nothing" or "made it
 * worse" — they must never let a visible partial improvement (moderate or
 * heavy pool scaling) score at or below doing nothing or the labeled-
 * harmful action.
 */
export const CACHE_STAMPEDE_SCORING: AuthoredScoringConfig = {
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
      // Banded far tighter than Kafka Consumer Lag's or Payment Retry
      // Storm's customerImpact: those scenarios' recovery/reliability
      // dimensions still differentiate every unresolved outcome from
      // every other via actual elapsed/critical time, so their
      // customerImpact dimension can afford to saturate at a coarse
      // top band early. This scenario's recovery/reliability do not (see
      // the module comment above) — every unresolved path hits the exact
      // same zeroed 450 points — so customerImpact must itself carry the
      // "did this action visibly reduce live customer harm" signal within
      // the realistic unresolved range this scenario's own revenue rates
      // produce (rules.ts's revenueLossRatePerMinute: masked-stampede 120,
      // degraded 150 < stampeding 450 < recurring-stampede 600 USD/min).
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 500, points: 90 },
        { points: 30 },
      ],
    },
    {
      // No duplicate/stale-write modeling yet — same documented limitation
      // as every other built-in scenario: award full marks via a single
      // catch-all band rather than fabricating a measure that doesn't
      // exist in the closed AuthoredScoringMeasure set.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: "dataIntegrity",
      bands: [{ points: 200 }],
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
      // Banded more forgivingly toward heavy pool scaling than Kafka
      // Consumer Lag's equivalent dimension: paying for more origin
      // capacity here is a real (if incomplete and non-durable)
      // mitigation that visibly reduces the active queue/cache-status
      // symptoms (see pool-scaled-without-coalescing in rules.ts), not
      // pure waste. A candidate who spent money to visibly reduce live
      // harm must never be penalized by costEfficiency alone enough to
      // fall below a candidate who spent nothing and changed nothing (or
      // made things worse) — these bands are deliberately shallow rather
      // than punitive; customerImpact (above) carries the harm-reduction
      // signal, this dimension only taxes waste at the margin.
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 1, points: 90 },
        { atMost: 4, points: 60 },
        { points: 30 },
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
