import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CUTOVER_STRATEGY_KEY, RECONCILIATION_DEPTH_KEY } from "./controls";

/**
 * Revenue loss here models BUSINESS-TRUST RISK from inconsistent/
 * silently-wrong reporting, never classic downtime — sourcesAvailability
 * Percent, warehouseWriteSuccessRate, and reportGenerationSuccessRate
 * never move, by design, so there is no availability-driven revenue loss
 * to model in the traditional sense. Every entry below is sized by how
 * unsafe/exposed the lineage-trust state is — the silent/premature-
 * decommission traps lose the MOST, despite having the best-looking
 * availability of any state in the scenario.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "undecided-active": 25,
  "undecided-sustained": 70,
  "global-flip-silent-active": 110,
  "global-flip-silent-sustained": 280,
  "global-flip-flagged-ungated": 150,
  "global-flip-flagged-gated": 60,
  "premature-decommission-trap": 230,
  "staged-just-engaged": 15,
  "staged-window1": 10,
  "staged-window2": 4,
  "staged-fully-complete": 0,
  "dual-write-just-engaged": 20,
  "dual-write-window1": 14,
  "dual-write-window2": 6,
  "dual-write-fully-complete-full-depth": 0,
  "dual-write-fully-complete-shallow-depth": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_600,
  perUnitMonthlyUsd: {
    // Alternate Strong Path B's real ongoing dual-compute cost — running
    // v1 and v2 in parallel for every source until reconciled costs real
    // money every month it stays engaged.
    [`${CUTOVER_STRATEGY_KEY}:dual-write-reconcile`]: 700,
    // The deeper reconciliation check is itself a further, independent
    // compute cost on top of dual-write-reconcile.
    [`${RECONCILIATION_DEPTH_KEY}:full`]: 260,
    // Staged-per-source cutover carries its own modest ongoing
    // migration-tooling/coordination cost (orchestrating sequential
    // per-source cutovers, auditable checkpoints), real but far smaller
    // than running a full second compute path for every source.
    [`${CUTOVER_STRATEGY_KEY}:staged-per-source`]: 180,
  },
};

/**
 * OPTIMAL: migration fully complete (every source verified and cut over
 * to v2), zero metrics EVER mixed v1/v2-derived lineage
 * (metricsWithMixedLineagePercent = 0), and the summary string states
 * both read fully consistent/complete. Reachable via EITHER alternate
 * strong path: staged-per-source (once its full cutover window has
 * elapsed) or dual-write-reconcile (either reconciliation depth, once
 * its full cutover window has elapsed).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "metricsWithMixedLineagePercent", operator: "equals", comparedTo: 0 },
    { key: "sourcesInInconsistentStateCount", operator: "equals", comparedTo: 0 },
    { key: "lineageConsistencyStatus", operator: "equals", comparedTo: "consistent" },
    { key: "migrationStatus", operator: "equals", comparedTo: "complete" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier this scenario
 * explicitly encourages (phase6e3.md's requirement that a slower, still-
 * migrating state may be entirely acceptable as long as nothing is ever
 * silently mixed) — zero metrics have EVER been served mixed-lineage
 * (metricsWithMixedLineagePercent = 0, lineageConsistencyStatus =
 * "consistent"), but the migration itself has not yet fully completed
 * (migrationStatus = "in-progress-safe").
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "metricsWithMixedLineagePercent", operator: "equals", comparedTo: 0 },
    { key: "lineageConsistencyStatus", operator: "equals", comparedTo: "consistent" },
    { key: "migrationStatus", operator: "equals", comparedTo: "in-progress-safe" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative reports-served-while-inconsistent exposure has run
 * long enough, at a severe enough rate, to constitute a catastrophic,
 * irrecoverable business-trust collapse within this attempt — not merely
 * "still migrating." Gated on the cumulative count (a real, counted
 * number of actual reports already served with silently-wrong numbers),
 * so a brief accidental flip is not instantly fatal but a sustained
 * silent/premature-decommission exposure window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "reportsServedWhileInconsistentCount", operator: "greater_than_or_equal", comparedTo: 380 },
  ],
  sustainedSeconds: 30,
};
