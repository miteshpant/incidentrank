import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { INGESTION_PAUSE_KEY, RECONCILIATION_MODE_KEY } from "./controls";

/**
 * Revenue loss here models LEGAL/REGULATORY/AUDIT BUSINESS RISK from
 * untrustworthy or tampered evidence, never classic downtime —
 * servicesUptimePercent and auditLoggerWriteSuccessRate never move
 * (see rules.ts), so there is no availability-driven revenue loss to
 * model in the traditional sense. Every entry below is sized by how
 * actively a live integrity violation (a falsely-clean report in
 * circulation, tampered immutable history, or untrustworthy ordering)
 * is in effect in that state — the tamper trap loses the most money of
 * any state despite looking like a quick cleanup action, and the
 * publish-as-is trap loses real money purely from a falsely-clean
 * report standing, with Services/Audit Logger numbers identical to
 * every safe state.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-degraded": 70,
  "baseline-sustained-degraded": 220,
  "publish-as-is-active": 160,
  "publish-as-is-sustained": 380,
  "immutable-store-tampered": 420,
  "unverified-report-unflagged-sustained": 340,
  "ordering-untrustworthy-sustained": 120,
  "path-a-corrected-before-sustained": 20,
  "path-b-corrected-before-sustained": 22,
  "path-a-just-engaged-no-drain-yet": 28,
  "path-b-just-engaged-no-drain-yet": 30,
  "path-a-draining-window1": 10,
  "path-b-draining-window1": 12,
  "path-a-fully-reconciled-ingestion-default": 0,
  "path-a-fully-reconciled-ingestion-paused": 0,
  "path-b-fully-reconciled-flagged": 0,
  "path-b-fully-reconciled-flagged-fallback-enabled": 0,
};

/**
 * Infrastructure cost is a minor, secondary signal here — it exists
 * only to capture the real, if modest, extra compute/storage cost of
 * running active reconciliation and consulting a secondary fallback
 * evidence source, layered on top of an unmodified baseline (never an
 * already-inflated one), so costIncreaseRatio correctly reads >0 only
 * for a candidate's OWN choices.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_200,
  perUnitMonthlyUsd: {
    [`${RECONCILIATION_MODE_KEY}:active`]: 70,
    [`${INGESTION_PAUSE_KEY}:paused`]: 20,
  },
};

/**
 * OPTIMAL: no live integrity violation on any axis (reportTrustStatus
 * "trustworthy", tamperEvidenceStatus "intact") AND the backlog has
 * fully drained (eventCompletenessPercent === 100 AND
 * orderingConfidencePercent === 100) — the fleet-wide reconciliation
 * sweep must have genuinely finished. Reachable via EITHER alternate
 * strong path once its drain window has genuinely elapsed.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "reportTrustStatus", operator: "equals", comparedTo: "trustworthy" },
    { key: "tamperEvidenceStatus", operator: "equals", comparedTo: "intact" },
    { key: "eventCompletenessPercent", operator: "equals", comparedTo: 100 },
    { key: "orderingConfidencePercent", operator: "equals", comparedTo: 100 },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — reportTrustStatus
 * is "trustworthy" and tamperEvidenceStatus is "intact" (no live
 * integrity violation happening right now on either axis), even though
 * the fleet-wide reconciliation sweep has not yet fully drained the
 * backlog. This is a real, operationally defensible handback: nothing
 * currently in circulation is falsely certified, and immutable history
 * has never been rewritten, even though full re-verification is still
 * in progress.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "reportTrustStatus", operator: "equals", comparedTo: "trustworthy" },
    { key: "tamperEvidenceStatus", operator: "equals", comparedTo: "intact" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative unverifiable-event exposure has run long enough,
 * at a severe enough rate, to constitute a catastrophic, irrecoverable
 * evidence-integrity collapse within this attempt — not merely "still
 * degraded." Gated on the cumulative count (a real, counted number of
 * actually-unrecoverable events), so a brief accidental flip is not
 * instantly fatal but a sustained unaddressed exposure window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "unverifiableEventCount", operator: "greater_than_or_equal", comparedTo: 400 }],
  sustainedSeconds: 30,
};
