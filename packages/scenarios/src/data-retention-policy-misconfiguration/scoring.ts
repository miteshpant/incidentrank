import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Data Retention Policy Misconfiguration's scoring configuration.
 *
 * SCORING-INTERPRETATION CONSTRAINT (binding for this scenario
 * specifically, per phase-6e-strategy-spec.md: "Primary objective is
 * compliance correctness... Availability is largely irrelevant"):
 * dataIntegrity/reliability carry the REAL judgment here — per-data-
 * class retention/deletion correctness — while customerImpact/recovery
 * are deliberately made to discriminate LESS SHARPLY, mirroring how
 * Model Feature Freshness Degradation treated availability as secondary
 * to decision-quality risk. applicationUptimePercent/
 * eventStoreWriteSuccessRate never move in any rule (see rules.ts) and
 * are never read by any scoring measure below — rewarding/penalizing
 * them would silently turn this back into a generic availability
 * scenario, exactly what this scenario must not become.
 *
 * NOTE ON maxPoints: the engine's six scoring dimensions use FIXED
 * maxPoints (recovery 300, customerImpact 200, dataIntegrity 200,
 * reliability 150, costEfficiency 100, operationalEfficiency 50 — see
 * authoring/validate.ts's SCORE_MAX_BY_DIMENSION) — this is NOT
 * reallocatable per scenario. "Availability is largely irrelevant" is
 * therefore expressed honestly WITHIN that fixed envelope: recovery's
 * bands are deliberately WIDE/forgiving (every genuinely safe path,
 * fast or slow, lands in the same top band or one band below it — the
 * gap between the fastest and slowest genuinely-compliant resolution is
 * small), and customerImpact's bands are similarly forgiving, so
 * neither dimension meaningfully separates two paths that are both
 * compliant. dataIntegrity (200) and reliability (150) instead carry
 * steep, decisive penalties — a path with ANY live violation on either
 * data class loses the large majority of both dimensions' points,
 * regardless of how fast it got there or how little revenue was lost
 * along the way. This reproduces the scenario's own stated priority
 * ordering without distorting the generic six-dimension engine or
 * inventing scenario-specific scorer code.
 *
 *   - dataIntegrity (the PRIMARY compliance-correctness gate): penalties
 *     mode against financialRecordsRetentionStatus ("actively-
 *     violated") — the scenario's central irreversible-damage axis —
 *     and against userDeletionRequestRetentionStatus ("deadline-
 *     breached") — the independent secondary-class violation (including
 *     the panic-pause-all trap). Both penalize independently and stack,
 *     so a path that violates BOTH classes at once (the panic-pause
 *     trap, sustained) loses more than a path that violates only one.
 *   - reliability: criticalTimeRatio against complianceSeverity (a
 *     severityField using the engine's normal/warning/critical
 *     vocabulary) — time spent with a COMPLIANCE violation genuinely
 *     live on either class, never time spent with availability
 *     degraded (Application/Event Store never carry a severity field in
 *     this scenario at all). Bands are steep: even a modest fraction of
 *     time spent in active violation costs the majority of this
 *     dimension's points.
 *   - customerImpact: revenueLossUsd — wide bands, genuinely secondary.
 *   - recovery: recoveryTimeSeconds — wide bands, genuinely secondary;
 *     "how fast you got the dashboards green" is explicitly not the
 *     primary signal this scenario tests.
 *   - costEfficiency: a minor, secondary signal (storage waste from an
 *     over-wide halt, and the real cost of validating a correction
 *     before rollout) — genuinely discriminates via costIncreaseRatio
 *     here since baseline cost is NOT already inflated (unlike Cross-
 *     Region Replication Cost Explosion/Runaway Cloud Spend's
 *     documented engine limitation) — every real cost increase here
 *     comes from a candidate's OWN choice (validate-first,
 *     ephemeralLogPurge=suspended) layered on top of an unmodified
 *     baseline, so costIncreaseRatio correctly reads >0 for those and 0
 *     for every path that never touches either lever.
 */
export const DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Deliberately WIDE bands: the fastest genuine OPTIMAL (corrected-
      // before-sustained family, drained) and the slowest genuine
      // OPTIMAL (sustained exposure allowed to compound, then the full
      // audited+validated Path B drain) both land in the top two bands
      // — recovery speed is a real but minor signal here, never the
      // scenario's central judgment.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 700, points: 300 },
        { atMost: 950, points: 270 },
        { atMost: 1_200, points: 230 },
        { atMost: 1_500, points: 180 },
        { points: 120 },
      ],
    },
    {
      // Deliberately WIDE bands — see module doc comment. Still real:
      // a path with an actively violated data class loses real
      // revenue-modeled credit, it just never outweighs
      // dataIntegrity/reliability's steep penalties below.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 200, points: 200 },
        { atMost: 600, points: 170 },
        { atMost: 1_400, points: 120 },
        { atMost: 2_500, points: 60 },
        { points: 15 },
      ],
    },
    {
      // PRIMARY compliance-correctness gate. See module doc comment:
      // penalties stack independently across the two data classes, so
      // a path that violates both at once (panic-pause-all, sustained)
      // loses substantially more than a path that violates only one —
      // and either violation alone already costs the large majority of
      // this dimension's 200 points. financialRecordsComplianceTier's
      // "partial" penalty is what genuinely separates ACCEPTABLE
      // (compliance rate not yet fully re-validated — no live
      // violation, but the fleet-wide sweep hasn't finished) from
      // OPTIMAL (100%, tier "full", no penalty at all) — without it,
      // both tiers would score byte-identically on every dimension
      // (recovery/customerImpact bands are deliberately wide, and the
      // retention-status penalty alone cannot see the difference
      // between 88% and 100%), which would be exactly the #88-style
      // scoring flaw this batch must avoid.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "financialRecordsRetentionStatus", value: "actively-violated" },
          atLeast: 1,
          subtractPoints: 140,
        },
        {
          measure: { type: "finalStringEquals", field: "financialRecordsComplianceTier", value: "partial" },
          atLeast: 1,
          subtractPoints: 20,
        },
        {
          measure: { type: "finalStringEquals", field: "userDeletionRequestRetentionStatus", value: "deadline-breached" },
          atLeast: 1,
          subtractPoints: 90,
        },
      ],
    },
    {
      // Steep bands: time spent with ANY live compliance violation on
      // either data class costs the majority of this dimension's
      // points quickly — criticalTimeRatio against complianceSeverity
      // (never against availability, which never carries a severity
      // field in this scenario at all).
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.05, points: 150 },
        { atMost: 0.15, points: 100 },
        { atMost: 0.3, points: 55 },
        { atMost: 0.5, points: 25 },
        { points: 5 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.05, points: 75 },
        { atMost: 0.1, points: 50 },
        { atMost: 0.2, points: 25 },
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
