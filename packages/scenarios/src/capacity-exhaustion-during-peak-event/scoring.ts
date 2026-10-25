import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Capacity Exhaustion During Peak Event's scoring configuration.
 *
 * Band widths are calibrated to THIS scenario's real authored timeline,
 * not a generic clock (same calibration principle as every other
 * phase6d scenario's scoring.ts): the fastest a candidate can EVER
 * reach genuine OPTIMAL is bounded by the slowest of the three
 * independent recovery-lag windows (cache warmup, DB connection pool
 * recovery, async queue drain) — queueDrainFullyDone at
 * SUSTAINED_PEAK_MS + 210_000ms, i.e. 450s after incident start, plus
 * the 30s successCondition sustain window = 480s minimum. The top
 * recovery band is set to 500s so OPTIMAL is never structurally
 * penalized relative to ACCEPTABLE (which is reachable immediately,
 * with no elapsed-time wait) for a reason that has nothing to do with
 * genuine recovery quality.
 *
 * dataIntegrity is this scenario's correctness-guard dimension (per
 * phase6d.4.md section 17's binding sanity checks): any path that ever
 * triggers non-policy-based random shedding must score materially
 * worse than baseline even if aggregate/global metrics look fine,
 * since random-shed genuinely reduces total volume and therefore
 * superficially improves several metrics while being the single worst
 * available action. Uses `penalties` mode against peakEventStatus (the
 * single authoritative correctness/safety summary), exactly like
 * Authorization Policy Rollout Failure's dataIntegrity dimension.
 */
export const CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 500, points: 300 },
        { atMost: 650, points: 250 },
        { atMost: 850, points: 180 },
        { atMost: 1_100, points: 110 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 900, points: 160 },
        { atMost: 1_800, points: 110 },
        { atMost: 3_500, points: 55 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment. A fully optimal/acceptable path with
      // peakEventStatus "optimal-protected" or "safe-degraded" keeps
      // the full 200 points. Any path that ever shows
      // "critical-traffic-dropped" (random-shed, at any duration) or
      // "db-collapse-risk" (the database actively being pushed toward
      // collapse right now) loses the vast majority of this
      // dimension's credit — this scenario's required "a path that
      // violates a core safety/correctness invariant must not score
      // near optimal" guarantee, independent of how good aggregate
      // availability looks in the same final state.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "peakEventStatus", value: "escalating" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          // Deliberately a substantial deduction, not a token one: the
          // acceptable tier (safe-degraded-protected, or either
          // strategy's converging intermediate state) reaches its
          // looser completion bar in well under 100s, far faster than
          // optimal's real, non-skippable recovery-lag wait (~480s
          // minimum across all three independent recovery windows).
          // Without this penalty, recovery/customerImpact's speed-based
          // bands alone let "acceptable" outscore "optimal" — exactly
          // the violation phase6d.4.md section 17 requires catching
          // ("acceptable does not dominate optimal without reason").
          // This keeps the fully-recovered resolution strictly ahead
          // for the right reason (the database genuinely returning to
          // "normal" and the queue genuinely shrinking, not an
          // arbitrary clock tie-breaker), while still scoring far
          // better than any db-collapse-risk or critical-traffic-
          // dropped path.
          measure: { type: "finalStringEquals", field: "peakEventStatus", value: "safe-degraded" },
          atLeast: 1,
          subtractPoints: 110,
        },
        {
          measure: { type: "finalStringEquals", field: "peakEventStatus", value: "db-collapse-risk" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "peakEventStatus", value: "critical-traffic-dropped" },
          atLeast: 1,
          subtractPoints: 190,
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
        { measure: "configurationChangeCount", atLeast: 10, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 16, subtractPoints: 10 },
      ],
    },
  ],
};
