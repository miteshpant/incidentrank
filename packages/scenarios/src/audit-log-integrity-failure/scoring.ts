import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Audit Log Integrity Failure's scoring configuration.
 *
 * SCORING-INTERPRETATION CONSTRAINT (binding for this scenario, mirroring
 * Data Retention Policy Misconfiguration's treatment of availability):
 * dataIntegrity/reliability carry the REAL judgment here — evidence
 * completeness/duplication/ordering/immutability correctness — while
 * customerImpact/recovery are deliberately made to discriminate LESS
 * SHARPLY. servicesUptimePercent/auditLoggerWriteSuccessRate never move
 * in any rule (see rules.ts) and are never read by any scoring measure
 * below — rewarding/penalizing them would silently turn this back into a
 * generic availability scenario, exactly what this scenario must not
 * become.
 *
 * NOTE ON maxPoints: the engine's six scoring dimensions use FIXED
 * maxPoints (recovery 300, customerImpact 200, dataIntegrity 200,
 * reliability 150, costEfficiency 100, operationalEfficiency 50 — see
 * authoring/validate.ts's SCORE_MAX_BY_DIMENSION) — this is NOT
 * reallocatable per scenario. Expressed honestly within that fixed
 * envelope: recovery's bands are deliberately WIDE/forgiving (every
 * genuinely safe path, fast or slow, lands in the same top band or one
 * below it), and customerImpact's bands are similarly forgiving.
 * dataIntegrity (200) and reliability (150) instead carry steep,
 * decisive penalties — a path with ANY live integrity violation loses
 * the large majority of both dimensions' points, regardless of how fast
 * it got there.
 *
 *   - dataIntegrity (the PRIMARY integrity-correctness gate): FOUR
 *     independent, stacking penalties: reportTrustStatus ("untrustworthy"
 *     — a live violation exists right now, whether or not anything has
 *     literally been published; see metrics.ts's doc comment on why this
 *     is a live, not merely "report already sent," signal);
 *     reportCertificationStatus ("falsely-certified" — a falsely-clean
 *     report has ACTUALLY been published at some point during this
 *     attempt; distinct from, and an additional penalty on top of,
 *     reportTrustStatus, so the act of certifying a false picture scores
 *     strictly worse than merely leaving a live violation unaddressed
 *     without ever publishing anything); tamperEvidenceStatus
 *     ("compromised" — immutable history has been rewritten at any
 *     point, the single most severe violation); and
 *     evidenceReconciliationTier ("partial" — the fleet-wide
 *     reconciliation sweep has not yet fully drained, with no live
 *     violation on the other three axes). All four stack additively, so
 *     the tamper trap (which also triggers a falsely-certified report in
 *     this scenario's authored states) loses the most points of any
 *     path, and the publish-as-is trap scores strictly worse than the
 *     generic unaddressed baseline (same reportTrustStatus penalty, plus
 *     the additional reportCertificationStatus penalty the baseline
 *     never incurs). The evidenceReconciliationTier "partial" penalty is
 *     what genuinely separates ACCEPTABLE from OPTIMAL.
 *   - reliability: criticalTimeRatio against evidenceIntegritySeverity —
 *     time spent with an evidence-integrity violation genuinely live,
 *     never time spent with availability degraded.
 *   - customerImpact: revenueLossUsd — wide bands, genuinely secondary.
 *   - recovery: recoveryTimeSeconds — wide bands, genuinely secondary.
 *   - costEfficiency: costIncreaseRatio — a minor, secondary signal (the
 *     real cost of active reconciliation / a fallback evidence source /
 *     pausing ingestion), layered on an unmodified baseline so
 *     costIncreaseRatio correctly reads >0 only for a candidate's own
 *     choices.
 */
export const AUDIT_LOG_INTEGRITY_FAILURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Deliberately WIDE bands: the fastest genuine OPTIMAL
      // (corrected-before-sustained family, drained) and the slowest
      // genuine OPTIMAL (sustained exposure allowed to compound, then
      // the full drain) both land in the top two bands — recovery
      // speed is a real but minor signal here.
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
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      // The 700 boundary (not 600) is deliberate: both alternate
      // OPTIMAL paths pay an identical, unavoidable ~500USD pre-action
      // exposure window before either path's first control change can
      // possibly land (the time between SUSTAINED_DEGRADATION_MS firing
      // and a candidate's earliest realistic reaction), then diverge by
      // only a few dollars depending on exactly which control is set
      // first. 700 keeps both genuine OPTIMAL paths in the same top
      // band rather than letting that few-dollar difference in
      // REACTION-ORDER cross a band boundary and manufacture an
      // unexplainable score gap between two equally-safe strategies —
      // see this scenario's dedicated Score Integrity / Option D
      // regression test.
      bands: [
        { atMost: 200, points: 200 },
        { atMost: 700, points: 170 },
        { atMost: 1_400, points: 120 },
        { atMost: 2_500, points: 60 },
        { points: 15 },
      ],
    },
    {
      // PRIMARY integrity-correctness gate. Penalties stack
      // independently, so the tamper trap (reportTrustStatus
      // "untrustworthy" AND tamperEvidenceStatus "compromised"
      // simultaneously) loses substantially more than a path that
      // violates only one. evidenceReconciliationTier's "partial"
      // penalty is what genuinely separates ACCEPTABLE (reconciliation
      // not yet fully drained — no live violation, but the fleet-wide
      // sweep hasn't finished) from OPTIMAL (tier "full", no penalty at
      // all) — without it, both tiers would score byte-identically on
      // every dimension (recovery/customerImpact bands are deliberately
      // wide, and the trust/tamper-status penalties alone cannot see the
      // difference between 85% and 100% completeness), which would be
      // exactly the #88-style scoring flaw this batch must avoid.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "reportTrustStatus", value: "untrustworthy" },
          atLeast: 1,
          subtractPoints: 100,
        },
        {
          measure: { type: "finalStringEquals", field: "reportCertificationStatus", value: "falsely-certified" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "tamperEvidenceStatus", value: "compromised" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "evidenceReconciliationTier", value: "partial" },
          atLeast: 1,
          subtractPoints: 20,
        },
      ],
    },
    {
      // Steep bands: time spent with ANY live evidence-integrity
      // violation costs the majority of this dimension's points
      // quickly — criticalTimeRatio against evidenceIntegritySeverity
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
