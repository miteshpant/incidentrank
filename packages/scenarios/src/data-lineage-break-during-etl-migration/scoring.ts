import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Data Lineage Break During ETL Migration's scoring configuration.
 *
 * SCORING-INTERPRETATION CONSTRAINT (binding for this scenario
 * specifically, mirroring Model Feature Freshness Degradation's section
 * 11 doctrine): dataIntegrity/reliability/customerImpact measure
 * LINEAGE-TRUST RISK here, never classic availability. sourcesAvailability
 * Percent/warehouseWriteSuccessRate/reportGenerationSuccessRate never
 * move in any rule (see rules.ts) and are never read by any scoring
 * measure below — rewarding/penalizing them would silently turn this
 * back into a generic availability scenario, exactly what this scenario
 * must not become.
 *
 *   - dataIntegrity: penalties mode against the two closed-enum
 *     string-state fields authored specifically for this judgment —
 *     lineageConsistencyStatus ("consistent" / "inconsistent-flagged" /
 *     "inconsistent-silent") and migrationStatus ("not-started" /
 *     "in-progress-safe" / "in-progress-unsafe" / "complete"). A path
 *     where lineage was ever silently mixed ("inconsistent-silent")
 *     loses substantially more credit than an honestly-flagged exposure,
 *     which itself loses a modest amount relative to full consistency.
 *     A FOURTH, much smaller penalty keys on migrationStatus ===
 *     "in-progress-safe" (NOT a correctness violation — zero metrics
 *     have ever been mixed-lineage in this state — but a real, honest
 *     distinction from a fully "complete" migration's strongest
 *     verified guarantee). This is what actually separates ACCEPTABLE
 *     from OPTIMAL on this scenario's one dimension that structurally
 *     can: recovery and reliability both already hit their top band the
 *     INSTANT a safe strategy engages (staged/dual-write never blend
 *     lineage, even at tick zero — see rules.ts's *-just-engaged rows),
 *     so without this dataIntegrity distinction, ACCEPTABLE and OPTIMAL
 *     scored IDENTICALLY on every dimension — discovered and fixed via
 *     this scenario's own suspicious-score investigation (see the test
 *     file's "acceptable path... scores well but below optimal" case).
 *   - reliability: criticalTimeRatio against lineageTrustSeverity (a
 *     severityField using the engine's normal/warning/critical
 *     vocabulary) — time spent with LINEAGE TRUST genuinely at risk,
 *     never time spent with availability itself degraded (Sources/
 *     Warehouse/Reports never carry a severity field in this scenario
 *     at all).
 *   - customerImpact: revenueLossUsd, sized in revenue-and-cost.ts by
 *     how unsafe/exposed the lineage-trust state is in each state — the
 *     silent-permissive-style and premature-decommission traps lose the
 *     MOST despite having the best-looking availability of any state in
 *     the scenario.
 *   - costEfficiency: costIncreaseRatio — genuinely first-class here,
 *     using the GENERIC peak-vs-baseline measure directly (unlike
 *     Cross-Region Replication Cost Explosion/Runaway Cloud Spend, this
 *     scenario's every cost-bearing lever only ever ADDS cost on top of
 *     an un-inflated baseline, so peak-vs-baseline genuinely
 *     discriminates — no finalStringEquals workaround needed):
 *     staged-per-source (modest ongoing coordination cost) and
 *     dual-write-reconcile (real ongoing dual-compute cost, more still
 *     at reconciliationDepth="full") land at materially different,
 *     honestly-ordered cost outcomes while all being fully safe. Every
 *     unsafe path (global-flip, undecided, premature-decommission)
 *     touches none of the cost-bearing controls, so it reaches the
 *     BEST possible costEfficiency score — dataIntegrity/reliability
 *     below must do the real safety work, so a path that looks best (or
 *     tied-best) on raw cost still loses decisively overall.
 */
export const DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to this scenario's real authored
      // timeline: the fastest genuine OPTIMAL resolution via
      // staged-per-source or dual-write-reconcile both require the full
      // cutover window on top of sustained-undecided onset
      // (recoveryTimeSeconds ~ 740-780s) — neither alternate path is
      // instant, unlike Model Feature Freshness Degradation's
      // fresh-fallback route, because every source genuinely needs real
      // elapsed verification time regardless of strategy. The top band
      // must extend far enough to include both equally-OPTIMAL paths, so
      // dataIntegrity (not recovery) is what separates "silently
      // unsafe" from "genuinely safe," never recovery time alone.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 850, points: 300 },
        { atMost: 1_100, points: 220 },
        { atMost: 1_500, points: 120 },
        { atMost: 2_000, points: 50 },
        { points: 15 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 800, points: 160 },
        { atMost: 1_600, points: 110 },
        { atMost: 3_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode on two closed-enum
      // lineage-trust string-state fields. A fully "consistent" +
      // "complete" path keeps full credit. An "inconsistent-flagged"
      // exposure (honestly visible but still live) loses a real amount.
      // "inconsistent-silent" (the primary trap family — identical
      // availability PLUS zero visibility) loses the most of all — this
      // scenario must never let either compromised variant look
      // "almost optimal," and the silent variant must score strictly
      // worse than the honestly-flagged one despite both having
      // identical sourcesAvailabilityPercent/warehouseWriteSuccessRate/
      // reportGenerationSuccessRate.
      //
      // A FOURTH, modest penalty keys on migrationStatus ===
      // "in-progress-safe" specifically (distinct from the
      // "in-progress-unsafe" penalty above) — this is NOT a correctness
      // violation (zero metrics have ever been mixed-lineage in this
      // state), but it is a real, honest distinction from a fully
      // "complete" migration: some sources are still mid-transition,
      // not yet carrying the strongest verified guarantee a finished
      // cutover provides. Without this, ACCEPTABLE (staged/dual-write,
      // still migrating) and OPTIMAL (fully complete) scored IDENTICALLY
      // on every dimension (recovery's top band and reliability's top
      // band were both already satisfied the instant the safe strategy
      // engaged, well before full completion) — this penalty is the fix,
      // discovered and verified via this scenario's own suspicious-score
      // investigation (see the test file's "acceptable path... scores
      // well but below optimal" case).
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "lineageConsistencyStatus", value: "inconsistent-flagged" },
          atLeast: 1,
          subtractPoints: 55,
        },
        {
          measure: { type: "finalStringEquals", field: "lineageConsistencyStatus", value: "inconsistent-silent" },
          atLeast: 1,
          subtractPoints: 120,
        },
        {
          measure: { type: "finalStringEquals", field: "migrationStatus", value: "in-progress-unsafe" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "migrationStatus", value: "in-progress-safe" },
          atLeast: 1,
          subtractPoints: 20,
        },
        // Secondary/accelerant penalty for cutoverAuditLog (business
        // invariant #2): only applies while a safe strategy is genuinely
        // mid-migration (migrationStatus === "in-progress-safe") AND no
        // durable per-step audit trail exists (cutoverAuditability ===
        // "opaque" — true while cutoverAuditLog is left at its false
        // default). Deliberately small relative to the 20pt
        // in-progress-safe penalty above and tiny next to the 55-120pt
        // primary lineage-mixing penalties — this is a real but modest
        // consequence for an auditability gap, never large enough to
        // outweigh the scenario's primary cutoverStrategy-vs-
        // reconciliationDepth judgment.
        {
          measure: { type: "finalStringEquals", field: "cutoverAuditability", value: "opaque" },
          atLeast: 1,
          subtractPoints: 10,
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
        { atMost: 0.1, points: 85 },
        { atMost: 0.3, points: 65 },
        { atMost: 0.45, points: 45 },
        { points: 15 },
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
