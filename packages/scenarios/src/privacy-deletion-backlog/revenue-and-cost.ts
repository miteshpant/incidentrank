import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { DELETION_WORKER_ALLOCATION_KEY, RETRY_POLICY_KEY } from "./controls";

/**
 * Revenue loss here models LEGAL/REGULATORY BUSINESS RISK from
 * incomplete/falsely-marked deletion execution, never classic downtime
 * — requestAcceptanceSuccessRate never moves (see rules.ts), so there is
 * no availability-driven revenue loss to model in the traditional sense.
 * Every entry below is sized by how actively a live violation (false
 * completion, untracked obligation, or deadline breach) is in effect in
 * that state — the half-measure traps (newest-first-with-boost,
 * high-risk-first-without-boost) lose real money purely from the
 * deadline-breach violation even though completion marking is correctly
 * verified in those exact states. Each half-measure trap has a
 * pre-sustained mirror (matched before sustainedBacklog fires) at a
 * smaller rate, reflecting the shorter elapsed exposure window — same
 * violation category, smaller magnitude.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-untouched": 95,
  "baseline-sustained-untouched": 260,
  "false-complete-active": 95,
  "false-complete-sustained": 260,
  "analytics-store-skipped-trap": 180,
  "backup-index-untracked-trap": 150,
  "deadline-breach-newest-first-trap": 200,
  "deadline-breach-newest-first-with-boost-trap": 170,
  "deadline-breach-high-risk-first-no-boost-trap": 190,
  "deadline-breach-newest-first-with-boost-pre-sustained-trap": 45,
  "deadline-breach-high-risk-first-no-boost-pre-sustained-trap": 50,
  "corrected-before-sustained": 20,
  "just-corrected-no-drain-yet": 25,
  "draining-window1-path-a": 10,
  "draining-window1-path-b": 11,
  "fully-recovered-path-a-baseline-standard": 0,
  "fully-recovered-path-a-scaled-aggressive": 0,
  "fully-recovered-path-a-scaled-standard": 0,
  "fully-recovered-path-a-baseline-aggressive": 0,
  "fully-recovered-path-b-baseline-standard": 0,
  "fully-recovered-path-b-scaled-aggressive": 0,
  "fully-recovered-path-b-scaled-standard": 0,
  "fully-recovered-path-b-baseline-aggressive": 0,
};

/**
 * Infrastructure cost is a minor, secondary signal here — it exists only
 * to capture the real, ongoing cost of scaling up deletion workers and
 * of retrying downstream calls more aggressively. Neither lever is
 * required for safety (see rules.ts's default-value path completeness
 * family), but both are real, non-dead cost/speed tradeoffs.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_600,
  perUnitMonthlyUsd: {
    [`${DELETION_WORKER_ALLOCATION_KEY}:scaled-up`]: 50,
    [`${RETRY_POLICY_KEY}:aggressive`]: 15,
  },
};

/**
 * OPTIMAL: end-to-end completion fully re-validated (endToEndCompletion
 * Percent = 100), no live false-completion, no live deadline breach, and
 * the Backup Index obligation is tracked. Reachable via EITHER alternate
 * strong path (oldest-deadline-first, or high-risk-first + boost) once
 * its drain window has genuinely elapsed — the rule's `when` never
 * constrains deletionWorkerAllocation/retryPolicy, so all four
 * combinations of those two secondary levers satisfy it identically for
 * either path.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "deletionWorkflowStatus", operator: "equals", comparedTo: "healthy" },
    { key: "endToEndCompletionPercent", operator: "equals", comparedTo: 100 },
    { key: "backupIndexTrackingStatus", operator: "equals", comparedTo: "tracked" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — a correct strategy
 * (verified-only completion marking + analytics store enforced + backup
 * index tracked + a real deadline-protecting queue strategy) is
 * genuinely engaged and NO live violation is happening right now (no
 * false completion, no deadline breach, Backup Index still tracked),
 * even though the backlog has not yet fully drained. A real,
 * operationally defensible handback: nothing is currently being falsely
 * completed, left untracked, or breaching deadline, even though the
 * fleet-wide completion sweep is still in progress.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "deletionWorkflowStatus", operator: "equals", comparedTo: "backlog-draining" },
    { key: "backupIndexTrackingStatus", operator: "equals", comparedTo: "tracked" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative false-completion exposure has run long enough, at
 * a severe enough rate, to constitute a catastrophic, irrecoverable
 * audit-integrity collapse within this attempt — not merely "still
 * backlogged." Gated on the cumulative count (a real, counted number of
 * actual permanently-false completion records), so a brief accidental
 * flip is not instantly fatal but a sustained unaddressed exposure
 * window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "falseCompletionCount", operator: "greater_than_or_equal", comparedTo: 400 }],
  sustainedSeconds: 30,
};
