import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { DEADLINE_COMMUNICATION_KEY, WAREHOUSE_CAPACITY_TIER_KEY } from "./controls";

/**
 * Revenue loss here models real BUSINESS RISK from a missed or
 * at-risk SLA-bound scheduled report (e.g. month-end close, SLA-bound
 * external reporting) — not classic request-level downtime. Every entry
 * is sized by how exposed the critical report job's SLA is in that
 * state. The overcorrection trap (adhoc-access-revoked) and the
 * hard-kill trap both carry their own real costs modeled elsewhere
 * (adHocAccessAvailabilityPercent / dataScienceLostWorkHoursCumulative)
 * even though their LIVE revenue-loss number can look good — this
 * dimension alone must never be read as "the whole picture" for those
 * two states, consistent with every other trap-bearing Phase 6E sibling.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-contention": 60,
  "baseline-sustained-contention": 260,
  "capacity-scaled-insufficient-active": 45,
  "capacity-scaled-insufficient-sustained": 220,
  // Real business cost from breaking downstream consumers of ad-hoc
  // output (dashboards, scheduled BI exports, other teams' own
  // deadlines) with zero warning — never zero, despite the critical
  // report's own SLA reading perfectly on-track.
  "adhoc-access-revoked-overcorrection": 80,
  "hard-kill-lost-work-trap": 5,
  "graceful-stop-bounded-loss": 30,
  "graceful-stop-bounded-loss-proactive": 30,
  "priority-queue-just-engaged": 15,
  "priority-queue-just-engaged-proactive": 15,
  "priority-queue-draining": 8,
  "priority-queue-draining-proactive": 8,
  "priority-queue-fully-recovered": 0,
  "priority-queue-fully-recovered-proactive": 0,
  "capped-just-engaged": 12,
  "capped-just-engaged-proactive": 12,
  "capped-draining": 6,
  "capped-draining-proactive": 6,
  "capped-fully-recovered": 0,
  "capped-fully-recovered-proactive": 0,
  "combined-prioritized-capped-draining": 4,
  "combined-prioritized-capped-draining-proactive": 4,
  "combined-prioritized-capped-fully-recovered": 0,
  "combined-prioritized-capped-fully-recovered-proactive": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 9_000,
  perUnitMonthlyUsd: {
    // The secondary capacity lever: scaling the shared Warehouse is a
    // real, continuous infrastructure spend, independent of whether it
    // actually protects the SLA (it does not, alone — see rules.ts).
    [`${WAREHOUSE_CAPACITY_TIER_KEY}:scaled`]: 3_200,
    // Proactive stakeholder notice is a small, real ongoing cost
    // (notification tooling / dashboard surfacing of the current
    // throttling window and why) — never free, never large enough to
    // change which path wins on cost alone.
    [`${DEADLINE_COMMUNICATION_KEY}:proactive-notice`]: 150,
  },
};

/**
 * OPTIMAL: the critical scheduled-report job is on track for its SLA,
 * zero ad-hoc query attempts are being refused outright
 * (adHocAccessAvailabilityPercent === 100 — ruling out the
 * overcorrection trap, which drops this to 0), and the workload tradeoff
 * reads "balanced" (ruling out both "overcorrected" and "sla-exposed").
 * Reachable via EITHER alternate strong path (priority-queue admission,
 * or ad-hoc cap) once its own drain window has elapsed, or combined.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "reportOnTrackForSla", operator: "equals", comparedTo: 1 },
    { key: "adHocAccessAvailabilityPercent", operator: "equals", comparedTo: 100 },
    { key: "workloadTradeoffStatus", operator: "equals", comparedTo: "balanced" },
    { key: "slaStatus", operator: "not_equals", comparedTo: "breached" },
    { key: "backlogStatus", operator: "equals", comparedTo: "clear" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier this scenario
 * explicitly encourages — the SLA is genuinely protected
 * (reportOnTrackForSla true, slaStatus not breached) and ad-hoc access
 * remains genuinely open (never revoked), but the backlog has not yet
 * fully drained, OR a bounded-cost long-running-job tradeoff
 * (graceful-stop) is still active without a prioritization lever also
 * engaged.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "reportOnTrackForSla", operator: "equals", comparedTo: 1 },
    { key: "adHocAccessAvailabilityPercent", operator: "equals", comparedTo: 100 },
    { key: "workloadTradeoffStatus", operator: "equals", comparedTo: "balanced" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: the critical scheduled-report job's SLA has actually been
 * missed (slaStatus "breached") for long enough to be a real,
 * irrecoverable-for-this-attempt business outcome, not merely "still at
 * risk." Gated on reportDeadlineMinutesRemaining reaching zero while
 * breached is the generic-engine-friendly proxy: breached states author
 * this at 0 directly (see rules.ts), so a sustained zero-minutes-
 * remaining reading is the real, named failure signal.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "slaStatus", operator: "equals", comparedTo: "breached" },
    { key: "reportQueueWaitMinutes", operator: "greater_than_or_equal", comparedTo: 28 },
  ],
  sustainedSeconds: 45,
};
