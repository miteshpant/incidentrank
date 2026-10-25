import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * ML Inference Cost vs Quality Incident's scoring configuration.
 *
 * This is a cost-primary scenario (phase6e3.md's scenario-94 brief:
 * "Primary dimension: Cost Efficiency") that must also stay genuinely
 * about QUALITY TRADEOFFS. Same real engine subtlety this scenario runs
 * into as Cross-Region Replication Cost Explosion and Runaway Cloud
 * Spend During Healthy Traffic: the generic costIncreaseRatio measure
 * compares PEAK monthly infrastructure cost (Math.max every tick)
 * against baseline — since infrastructureCost.baselineMonthlyUsd here
 * is anchored at the already-inflated SUSTAINED-misroute level (see
 * revenue-and-cost.ts) and EVERY reachable lever only ever reduces cost
 * below it (never raises it further), peak cost never rises above
 * baseline and costIncreaseRatio is permanently 0 for every reachable
 * path. costEfficiency therefore instead bands on costStatus (a
 * generic string-state field, metrics.ts/rules.ts, reading the real
 * rule-authored monthlyInferenceCostUsd) via the SAME finalStringEquals
 * mechanism every other built-in scenario's non-generic judgment axis
 * already uses — never scenario-specific scorer code, never a
 * distortion of the generic engine.
 *
 * Critically, the UNSAFE MINIMUM-COST path (blanket-small-model with
 * criticalSegmentPolicy left unprotected) reaches the cheapest inference
 * spend of ANY reachable state (monthlyInferenceCostUsd 900, far below
 * even the fully-optimized safe paths) and would therefore score BEST
 * on costEfficiency alone — mirroring every other Phase 6E cost-primary
 * scenario's deliberate design: dataIntegrity and reliability below
 * must do the real safety work, so a path that looks best on raw cost
 * still loses decisively overall.
 *
 * dataIntegrity is repurposed (the generic scorer's penalties-mode
 * convention used by every other security/durability-gated scenario in
 * this codebase) as the primary QUALITY-PROTECTION gate against
 * qualityProtectionStatus — a path that ever reads
 * "silently-downgraded" loses the vast majority of this dimension's
 * points.
 *
 * reliability gates on the same underlying condition from a second,
 * independent angle: it penalizes "silently-downgraded" again AND
 * separately penalizes via criticalTimeRatio (time spent with
 * decision-quality genuinely at risk — see definition.ts's
 * qualityRiskSeverity severity field, deliberately independent of
 * componentHealth, which never leaves "healthy" anywhere in this
 * scenario). NOTE (honest limitation, same spirit as the costEfficiency
 * doc comment above): neither finalStringEquals nor any numeric measure
 * in this engine's closed AuthoredScoringMeasure set can read
 * state.peaks.peakValues directly (there is no "peak-numeric-at-least"
 * measure type) — so reliability/dataIntegrity here, like every other
 * built-in scenario's equivalent dimension, score the FINAL matched
 * rule's state, never a true immutable historical record by
 * themselves. The permanent, non-resetting proof that an exposure
 * genuinely happened lives in state.peaks.peakValues directly (see
 * definition.ts's numericWatchFields and this scenario's test file's
 * dedicated non-resetting-peak assertions), verified by reading
 * state.peaks.peakValues in tests, exactly the same honest boundary
 * Model Feature Freshness Degradation and Cross-Region Replication Cost
 * Explosion both already document and rely on.
 */
export const ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds tuned against this scenario's authored
      // timeline: the fastest genuine ACCEPTABLE Finish is reachable
      // moments after engaging any always-safe lever (e.g.
      // blanket-large-model or the critical-segment pin), while the
      // fastest OPTIMAL (quality-tiering) is reachable at an equally
      // fast elapsed time, since Path B has no recovery-lag drain
      // window of its own — the cost/quality reduction is immediate
      // once engaged. Path A (classifier remediation) is genuinely
      // slower, which this dimension rewards honestly without itself
      // deciding "optimal wins" — the quality/cost dimensions below
      // carry that weight.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 45, points: 300 },
        { atMost: 120, points: 280 },
        { atMost: 300, points: 250 },
        { atMost: 600, points: 150 },
        { points: 40 },
      ],
    },
    {
      // Real, nonzero revenue-loss model for the live silent-downgrade
      // violation (see revenue-and-cost.ts) — distinct from the
      // cost-primary dimension below, which is about infrastructure
      // spend, not customer-facing business risk.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 0, points: 200 },
        { atMost: 500, points: 120 },
        { points: 40 },
      ],
    },
    {
      // Primary quality-protection gate. A path where
      // qualityProtectionStatus has ever read "silently-downgraded"
      // loses the vast majority of this dimension's points — a real,
      // named business-invariant violation, strictly worse than simply
      // not having contained cost yet, however good the raw cost
      // numbers look.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "qualityProtectionStatus", value: "silently-downgraded" },
          atLeast: 1,
          subtractPoints: 180,
        },
      ],
    },
    {
      // Secondary, independent gate: penalizes the same underlying
      // violation a second time from the "is the system currently
      // compliant" angle, plus an additional, distinct penalty via
      // criticalTimeRatio (see below) — an attempt that spent a large
      // share of ITS OWN elapsed duration with quality-risk severity at
      // "critical" is strictly worse than one that only briefly dipped
      // into it, even on a final state where the live field has since
      // cleared.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "qualityProtectionStatus", value: "silently-downgraded" },
          atLeast: 1,
          subtractPoints: 90,
        },
        // criticalTimeRatio is time-in-CRITICAL-severity ratio (this
        // scenario's qualityRiskSeverity field) — distinct from the
        // live-state check above, it independently penalizes an
        // attempt that spent a large share of its OWN elapsed duration
        // with quality-risk severity at "critical", even if the final
        // state has since cleared.
        { measure: "criticalTimeRatio", atLeast: 0.2, subtractPoints: 20 },
        { measure: "criticalTimeRatio", atLeast: 0.5, subtractPoints: 40 },
      ],
    },
    {
      // First-class cost dimension (phase6e3.md scenario-94 brief),
      // scored via penalties against costStatus's closed string enum
      // (see this dimension config's doc comment above for why the
      // generic costIncreaseRatio measure cannot discriminate in this
      // scenario). "cost-contained" (monthlyInferenceCostUsd at or
      // below roughly 3,600, reachable via quality-tiering OR a fully-
      // rolled-out classifier fix OR the unsafe blanket-small-model
      // trap — the unsafe trap ALSO lands here, deliberately, matching
      // requirement 6's "unsafe can look best on raw cost" mandate) vs
      // "cost-explosive" (every other reachable state, including the
      // honestly-labeled blanket-large-model/protected-rollout family
      // that never contains cost at all). Keyed via finalStringEquals
      // on exactly one value, so the penalty never double-counts.
      dimension: "costEfficiency",
      maxPoints: 100,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "costStatus", value: "cost-explosive" },
          atLeast: 1,
          subtractPoints: 70,
        },
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
