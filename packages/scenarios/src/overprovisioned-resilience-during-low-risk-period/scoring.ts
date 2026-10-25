import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Overprovisioned Resilience During Low-Risk Period's scoring
 * configuration.
 *
 * This scenario poses no live availability incident by design, so
 * recovery/customerImpact necessarily carry less of the real judgment
 * weight here than in an active-outage scenario — dataIntegrity (used
 * as the mandatory-floor penalty gate, mirroring Identity Platform
 * Degradation's and Privilege Escalation via Stale Authorization
 * Cache's "penalties" technique against a closed string enum) and
 * costEfficiency (the scenario's first-class judgment axis, per
 * phase6e2.md requirement 1) carry the real weight instead.
 *
 * dataIntegrity gates on resilienceFloorStatus: any path that was ever
 * below-floor loses the large majority of this dimension's points,
 * regardless of how good availability/cost looked while it was
 * violated — the required "a minimum-cost path must never score as
 * safe" guarantee.
 *
 * ── Why costEfficiency uses penalties against costPostureStatus,
 * rather than the generic costIncreaseRatio measure ───────────────────
 * costIncreaseRatio is defined (packages/scenarios/src/authoring/score.ts)
 * as (peakMonthlyInfrastructureCostUsd - baseline) / baseline, and the
 * engine initializes peakMonthlyCostUsd TO baselineMonthlyUsd at tick 0
 * (packages/simulator/src/simulate.ts), only ever Math.max()'ing it
 * upward afterward (tick.ts). This scenario deliberately starts at its
 * most expensive configuration (every control's initial value carries a
 * perUnitMonthlyUsd delta of exactly 0) and only ever reduces cost from
 * there — so the peak can never rise above the baseline and the live
 * cost can only fall below it, which means costIncreaseRatio is
 * mathematically pinned at exactly 0 for every single reachable state
 * in this scenario, safe or unsafe, reduced or not (verified directly
 * in the test file). This is a genuine property of a peak-tracked
 * ratio applied to a monotonically-decreasing-from-baseline cost curve,
 * not an authoring mistake. Per phase6e2.md requirement 5 (use only the
 * existing six dimensions via the generic scorer, never distort it),
 * the honest approach is to express this scenario's cost-efficiency
 * judgment using the SAME generic finalStringEquals/finalStringNotEquals
 * measure dataIntegrity/reliability already use against a closed string
 * enum — here, costPostureStatus — rather than banding a numeric ratio
 * that cannot move in this scenario's specific cost topology.
 */
export const OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 240, points: 270 },
        { atMost: 480, points: 220 },
        { atMost: 900, points: 120 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 0, points: 200 },
        { atMost: 500, points: 140 },
        { atMost: 2_000, points: 80 },
        { atMost: 5_000, points: 30 },
        { points: 10 },
      ],
    },
    {
      // Primary mandatory-floor gate. A path that was ever below-floor
      // loses the large majority of credit here, deliberately set well
      // below even the plain unreviewed-but-safe baseline's full credit
      // — a real floor violation is strictly worse than simply not
      // having optimized cost at all, even when the violation never
      // triggered a drill-hit consequence (the quiet, green-dashboard
      // violation is penalized just as heavily as the drill-hit one,
      // since the unsafe EXPOSURE existed regardless of whether the
      // drill happened to catch it within this attempt's window).
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "resilienceFloorStatus", value: "at-floor-or-above" },
          atLeast: 1,
          subtractPoints: 180,
        },
      ],
    },
    {
      // Reliability separately rewards the OPTIMAL tier's full
      // cost-review completion over the ACCEPTABLE tier's partial one,
      // and penalizes a below-floor cost posture here too (on top of
      // dataIntegrity's own, larger floor-violation penalty) — a real,
      // distinct "is the system, as a system, actually fully reviewed
      // and back to a settled posture" signal, independent of whether a
      // drill happened to exercise the violation within this attempt's
      // window (dataIntegrity already penalizes the violation itself,
      // regardless of whether a drill fired).
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "costPostureStatus", value: "reduced-partial-safe" },
          atLeast: 1,
          subtractPoints: 25,
        },
        {
          measure: { type: "finalStringEquals", field: "costPostureStatus", value: "unreviewed-peak-posture" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "costPostureStatus", value: "reduced-below-floor" },
          atLeast: 1,
          subtractPoints: 110,
        },
      ],
    },
    {
      // The scenario's first-class cost-efficiency axis (phase6e2.md
      // requirement 1), expressed via penalties against costPostureStatus
      // (see the module doc comment above for why costIncreaseRatio
      // cannot be used here). Full credit by default (the genuine,
      // substantial OPTIMAL reduction — reachable via either alternate
      // strategy); a real but smaller penalty for the ACCEPTABLE
      // partial reduction (real savings, just not the full review); a
      // larger penalty for the wasteful-but-safe baseline (zero
      // reduction realized at all); and the LARGEST penalty of all for
      // a below-floor cost posture — deliberately scoring the unsafe
      // path WORSE on cost-efficiency than even the wasteful baseline,
      // on top of the much larger dataIntegrity/reliability penalties
      // it already carries, so it can never win on this dimension
      // either despite its lower raw monthly cost.
      dimension: "costEfficiency",
      maxPoints: 100,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "costPostureStatus", value: "reduced-partial-safe" },
          atLeast: 1,
          subtractPoints: 25,
        },
        {
          measure: { type: "finalStringEquals", field: "costPostureStatus", value: "unreviewed-peak-posture" },
          atLeast: 1,
          subtractPoints: 55,
        },
        {
          measure: { type: "finalStringEquals", field: "costPostureStatus", value: "reduced-below-floor" },
          atLeast: 1,
          subtractPoints: 80,
        },
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
