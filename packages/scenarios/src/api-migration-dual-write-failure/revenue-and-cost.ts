import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { REPAIR_PRIORITY_KEY, ROLLOUT_PERCENT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "dual-write-unmitigated-baseline": 320,
  "dual-write-unmitigated-escalated": 520,
  "aggressive-rollout-increase-accelerates-divergence": 420,
  "aggressive-rollout-increase-accelerates-divergence-escalated": 680,
  "aggressive-rollout-increase-with-shadow-warmup": 370,
  "aggressive-rollout-increase-with-shadow-warmup-escalated": 560,
  "divergence-active-unmanaged": 500,
  "unsafe-sequence-rollback-before-reconcile": 180,
  "unsafe-sequence-rollback-before-reconcile-early": 150,
  "unsafe-sequence-rollback-cohort-exposed": 170,
  "replay-blind-corrupts-data": 260,
  "frozen-no-reconciliation-legacy-authoritative": 90,
  "frozen-no-reconciliation-new-authoritative": 95,
  "draining-normal-priority-legacy-authoritative": 60,
  "draining-normal-priority-new-authoritative": 65,
  "draining-critical-first-new-authoritative": 55,
  "draining-critical-first-high-rollout-contention": 110,
  "fully-reconciled-rollback-legacy": 0,
  "fully-reconciled-continue-new": 0,
  "fully-reconciled-undeclared": 10,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_200,
  perUnitMonthlyUsd: {
    [`${REPAIR_PRIORITY_KEY}:critical-first`]: 260,
    [`${ROLLOUT_PERCENT_KEY}:75`]: 80,
    [`${ROLLOUT_PERCENT_KEY}:100`]: 150,
  },
};

/**
 * Full recovery (OPTIMAL): the historical divergence backlog has
 * fully drained to zero (unreconciledDivergentRecordCount === 0),
 * neither hard correctness violation (exposed divergent read, lost
 * acknowledged write, blind-replay corruption) has ever occurred, and
 * write authority has settled on exactly one source
 * (correctnessStatus === "safe", writeAuthorityRiskStatus ===
 * "normal"). This is only reachable via reconciliationWindowElapsed
 * AND a control combination that actually ran diff-and-repair for the
 * whole window with a single-sourced write mode — a candidate who
 * left writeMode on "dual", or who used replay-blind, or who rolled
 * back before reconciling, never reaches these numbers no matter how
 * much simulated time passes.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "unreconciledDivergentRecordCount", operator: "equals", comparedTo: 0 },
    { key: "exposedDivergentReadCount", operator: "equals", comparedTo: 0 },
    { key: "silentlyLostAcknowledgedWriteCount", operator: "equals", comparedTo: 0 },
    { key: "blindReplayCorruptionCount", operator: "equals", comparedTo: 0 },
    { key: "correctnessStatus", operator: "equals", comparedTo: "safe" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: no hard correctness violation has ever occurred
 * (zero exposed reads, zero lost writes, zero blind-replay corruption),
 * new divergence has genuinely stopped accumulating
 * (correctnessStatus === "contained" — only reachable once writeMode
 * has left "dual"), and the historical backlog, while still nonzero,
 * is BOUNDED and demonstrably draining (reconciliationQueueDepth
 * strictly below its frozen-no-reconciliation ceiling of 300,
 * reflecting diff-and-repair actually running) rather than frozen or
 * still growing. This recognizes the real "draining-*" rule states as
 * a legitimate, bounded, safe-but-imperfect tradeoff distinct from the
 * fully-drained optimal tier.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "exposedDivergentReadCount", operator: "equals", comparedTo: 0 },
    { key: "silentlyLostAcknowledgedWriteCount", operator: "equals", comparedTo: 0 },
    { key: "blindReplayCorruptionCount", operator: "equals", comparedTo: 0 },
    { key: "correctnessStatus", operator: "equals", comparedTo: "contained" },
    { key: "unreconciledDivergentRecordCount", operator: "less_than_or_equal", comparedTo: 100 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: either hard correctness violation has reached a scale that
 * represents genuine, severe, unrecoverable-on-a-reasonable-timeline
 * damage — a sustained, large volume of lost acknowledged writes, or a
 * divergence backlog that has grown far past any bounded/recoverable
 * scale while fully unmanaged.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "silentlyLostAcknowledgedWriteCount", operator: "greater_than_or_equal", comparedTo: 200 },
  ],
  sustainedSeconds: 45,
};
