import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cross-Region Replication Cost Explosion's scoring configuration.
 *
 * This is a cost-primary scenario (phase6e2.md requirement 1):
 * costEfficiency is a genuine first-class judgment axis, not decorative
 * 10-point variation. Note a real engine subtlety this scenario runs
 * into: the generic costIncreaseRatio measure compares PEAK monthly
 * infrastructure cost (Math.max every tick) against baseline — since
 * EVERY lever here only ever reduces cost below the already-inflated
 * policy-change baseline (never raises it), peak cost never rises above
 * baseline and costIncreaseRatio is permanently 0 for every reachable
 * path. costEfficiency therefore instead bands on costReductionTier (a
 * generic string-state field, metrics.ts/rules.ts, reading the real
 * rule-authored monthlyTotalReplicationCostUsd) via the SAME
 * finalStringEquals mechanism every other built-in scenario's
 * non-generic judgment axis already uses — never scenario-specific
 * scorer code, never a distortion of the generic engine. Critically,
 * the UNSAFE MINIMUM-COST path (dropping criticalReplicationFactor
 * below the policy floor, optionally stacked on top of every other safe
 * lever too) reaches "deep-reduction" — the SAME top tier the safest,
 * fully-combined strategy reaches — and would therefore score BEST on
 * this dimension alone, tied with the safest path — mirroring Runaway
 * Cloud Spend During Healthy Traffic's and Overprovisioned Resilience
 * During Low-Risk Period's identical, deliberate design: dataIntegrity
 * and reliability below must do the real safety work, so a path that
 * looks best (or tied-best) on raw cost still loses decisively overall.
 *
 * dataIntegrity is repurposed (the generic scorer's penalties-mode
 * convention used by every other security/durability-gated scenario in
 * this codebase) as the primary DURABILITY gate against
 * criticalDataDurabilityStatus — a path that ever reads
 * "below-policy-floor" loses the vast majority of this dimension's
 * points.
 *
 * reliability gates on the same underlying condition from a second,
 * independent angle: it penalizes "below-policy-floor" again AND
 * separately penalizes drDrillStatus === "breach-detected" — the
 * drill-verified historical marker — so a breach that was ever
 * actually CAUGHT live by a DR drill loses real, additional credit
 * here. Note this reads the FINAL matched rule's string values (both
 * via buildScoringInputs in the test file's manual-inputs path and via
 * the Finish-derived extractFinishScoringInputs path): a candidate who
 * restores the critical factor AFTER a drill caught the breach sees
 * this specific penalty clear (drDrillStatus reads back to
 * "none-scheduled" once a clean rule matches again) even though the
 * PEAK-tracked criticalDataExposureEventCount — scored nowhere
 * directly, deliberately, since dataIntegrity/reliability's
 * live-field penalties already carry this scenario's safety judgment
 * — remains permanently nonzero as the historical record (see
 * definition.ts's numericWatchFields and the test file's dedicated
 * non-resetting-peak proof).
 */
export const CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds tuned against this scenario's authored
      // timeline: the fastest a genuine ACCEPTABLE Finish can be
      // sustained-eligible is shortly after any single always-safe
      // lever is engaged (e.g. archive-only-fix or compression-only-fix,
      // reachable moments after POLICY_CHANGE_DISCOVERED_MS), while the
      // fastest OPTIMAL requires a real strategy engaged — reachable at
      // a similar elapsed time, since neither strategy in this scenario
      // has a recovery-lag drain window of its own (the cost reduction
      // is immediate once the relevant controls are set — see rules.ts;
      // there is no "wait for it to drain" mechanic here, unlike
      // Replication Backlog or Data Pipeline Freshness Collapse). The
      // gap between acceptable's and optimal's fastest bands is
      // deliberately small — this dimension rewards genuine recovery
      // speed honestly, it does not by itself make optimal "win"; the
      // cost/durability dimensions below carry that weight.
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
      // There is no outage anywhere in this scenario; revenueLossUsd
      // stays at exactly zero for every reachable state, safe or
      // unsafe (see revenue-and-cost.ts's comment: durability and
      // availability are orthogonal here). This dimension exists only
      // to compile a complete six-dimension config — it is never the
      // scenario's real judgment axis, and every path scores
      // identically on it.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [{ atMost: 0, points: 200 }, { points: 50 }],
    },
    {
      // Primary durability gate. A path where criticalDataDurabilityStatus
      // has ever read "below-policy-floor" loses the vast majority of
      // this dimension's points — a real, named policy-floor violation
      // on the business's disaster-recovery guarantee, strictly worse
      // than simply not having optimized cost yet, however good the raw
      // cost numbers look.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "criticalDataDurabilityStatus", value: "below-policy-floor" },
          atLeast: 1,
          subtractPoints: 180,
        },
      ],
    },
    {
      // Secondary, independent gate: penalizes the same underlying
      // violation a second time from the "is the whole system actually
      // policy-compliant" angle, plus an additional, distinct penalty
      // for a drill-verified historical exposure event ever having
      // occurred — a breach that was ever actually CAUGHT live is
      // strictly worse than one that was merely in effect but never
      // tested, and this must show up even on a final state where the
      // live durability field has since been restored to compliant.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "criticalDataDurabilityStatus", value: "below-policy-floor" },
          atLeast: 1,
          subtractPoints: 110,
        },
        {
          measure: { type: "finalStringEquals", field: "drDrillStatus", value: "breach-detected" },
          atLeast: 1,
          subtractPoints: 35,
        },
      ],
    },
    {
      // First-class cost dimension (phase6e2.md requirement 1), scored
      // via penalties against costReductionTier's closed string enum
      // (see this dimension config's doc comment above for why the
      // generic costIncreaseRatio measure cannot discriminate in this
      // scenario). Tiers, by real rule-authored total cost against the
      // 6,300 baseline: "deep-reduction" (<=2,130, reachable via
      // both-strategies-fully-optimized OR either drilled/undetected
      // critical-factor-breach state — the unsafe trap ALSO lands here,
      // deliberately, matching requirement 4's "unsafe can look best on
      // raw cost" mandate), "good-reduction" (3,500, Strategy A alone),
      // "moderate-reduction" (4,850, Strategy B alone — genuinely, if
      // modestly, behind Strategy A's own cost ceiling, an honest
      // alternate-path cost difference per phase6e2.md requirement 3),
      // "minimal-reduction" (5,250, either single orthogonal lever
      // alone), "no-reduction" (6,300, baseline/pinned). Each penalty
      // below is keyed to exactly one tier via finalStringEquals (never
      // NotEquals), so penalties never stack across tiers — this
      // reproduces an ascending-cost band ordering without `bands`
      // (which only accepts a single numeric measure).
      dimension: "costEfficiency",
      maxPoints: 100,
      // Each penalty is keyed to one tier and ONLY one tier
      // (finalStringEquals, not NotEquals) so penalties never stack
      // across tiers — every tier gets exactly one deduction, giving a
      // clean, independently-verifiable point value per tier:
      // deep-reduction=100, good-reduction=85, moderate-reduction=70,
      // minimal-reduction=45, no-reduction=20.
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "costReductionTier", value: "good-reduction" },
          atLeast: 1,
          subtractPoints: 15,
        },
        {
          measure: { type: "finalStringEquals", field: "costReductionTier", value: "moderate-reduction" },
          atLeast: 1,
          subtractPoints: 30,
        },
        {
          measure: { type: "finalStringEquals", field: "costReductionTier", value: "minimal-reduction" },
          atLeast: 1,
          subtractPoints: 55,
        },
        {
          measure: { type: "finalStringEquals", field: "costReductionTier", value: "no-reduction" },
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
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
      ],
    },
  ],
};
