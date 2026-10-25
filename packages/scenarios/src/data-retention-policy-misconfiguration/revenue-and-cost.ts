import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { FIX_ROLLOUT_MODE_KEY } from "./controls";

/**
 * Revenue loss here models LEGAL/REGULATORY BUSINESS RISK from active
 * retention/deletion non-compliance, never classic downtime —
 * applicationUptimePercent and eventStoreWriteSuccessRate never move
 * (see rules.ts), so there is no availability-driven revenue loss to
 * model in the traditional sense. Every entry below is sized by how
 * actively a live compliance violation (on EITHER data class) is in
 * effect in that state — the panic-pause-all-classes trap loses real
 * money on BOTH data classes simultaneously despite looking like the
 * most cautious possible response, and the baseline/legal-hold-breach
 * states lose real money purely from an unaddressed Financial Records
 * violation, with Application/Event Store numbers identical to every
 * safe state.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-misconfigured": 90,
  "baseline-sustained-misconfigured": 240,
  "panic-pause-all-classes-active": 140,
  "panic-pause-all-classes-sustained": 320,
  "legal-hold-breach-trap": 210,
  "wrong-class-suspended-sustained": 230,
  "corrected-before-sustained": 25,
  "just-corrected-no-drain-yet": 30,
  "draining-window1-audited-validated": 10,
  "draining-window1-direct-unvalidated": 18,
  "draining-window1-audited-unvalidated": 14,
  "draining-window1-unaudited-validated": 14,
  "fully-recovered-audited-validated": 0,
  "fully-recovered-direct-unvalidated": 0,
  "fully-recovered-audited-unvalidated": 0,
  "fully-recovered-unaudited-validated": 0,
  "fully-recovered-direct-unvalidated-logs-suspended": 0,
};

/**
 * Infrastructure cost is a minor, secondary signal here (the strategy
 * spec is explicit that this scenario's primary objective is compliance
 * correctness, not cost or availability) — it exists only to capture
 * the real, if modest, storage waste from leaving deletion suspended on
 * a data class wider than the actual problem required (the panic-halt
 * trap's ephemeral-log side effect, or a candidate directly suspending
 * log purging) and the real, modest extra time/compute cost of running
 * a validation pass before rolling a correction to production.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_400,
  perUnitMonthlyUsd: {
    [`${FIX_ROLLOUT_MODE_KEY}:validate-first`]: 55,
  },
};

/**
 * OPTIMAL: Financial Records fully compliant (financialRecordsRetentionStatus
 * = "compliant", complianceRate = 100), User-Deletion-Request data fully
 * compliant (never touched by the fix, never breached), and no live
 * violation on either class. Reachable via EITHER alternate strong path
 * (direct targeted correction, or audit-first + validate-first) once
 * its drain window has genuinely elapsed — the rule's `when` never
 * constrains auditSequencing/fixRolloutMode, so all four combinations
 * (and the logs-suspended variant) satisfy it identically.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "financialRecordsRetentionStatus", operator: "equals", comparedTo: "compliant" },
    { key: "financialRecordsComplianceRatePercent", operator: "equals", comparedTo: 100 },
    { key: "userDeletionRequestRetentionStatus", operator: "equals", comparedTo: "compliant" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — the targeted
 * correction (financial-class-corrected + legal-hold enforced) is
 * genuinely engaged and NO live violation is happening on either data
 * class right now, but the fleet-wide Financial Records compliance
 * RATE has not yet fully re-validated every in-scope record (still
 * draining). This is a real, operationally defensible handback: the
 * bleeding has stopped and nothing is currently being wrongly purged or
 * wrongly retained, even though the full re-validation sweep is still
 * in progress.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "financialRecordsRetentionStatus", operator: "equals", comparedTo: "compliant" },
    { key: "userDeletionRequestRetentionStatus", operator: "equals", comparedTo: "compliant" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative wrongly-deleted Financial Records exposure has run
 * long enough, at a severe enough rate, to constitute a catastrophic,
 * irrecoverable compliance collapse within this attempt — not merely
 * "still misconfigured." Gated on the cumulative count (a real, counted
 * number of actual permanently-lost records), so a brief accidental
 * flip is not instantly fatal but a sustained unaddressed exposure
 * window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "financialRecordsWronglyDeletedCount", operator: "greater_than_or_equal", comparedTo: 400 }],
  sustainedSeconds: 30,
};
