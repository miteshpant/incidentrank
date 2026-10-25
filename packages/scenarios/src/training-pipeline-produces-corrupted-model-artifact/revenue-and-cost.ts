import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { ROLLBACK_TARGET_KEY, VALIDATION_COMPUTE_TIER_KEY } from "./controls";

/**
 * Revenue loss here models BUSINESS RISK from decisions made on a
 * corrupted model's output, never classic downtime — trainingPipeline
 * SuccessRate and deploymentPipelineUptimePercent never move, by
 * design, so there is no availability-driven revenue loss to model in
 * the traditional sense. Every entry below is sized by how unsafe/
 * exposed currentServingArtifactTrustStatus and
 * cumulativeDecisionsOnCorruptedModel are in that state — the
 * lineage-destroyed trap loses heavily despite having already pulled
 * the artifact from serving, because the business can no longer prove
 * what happened (a real, separate cost from live exposure).
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "corrupted-serving-active": 95,
  "corrupted-serving-sustained": 230,
  "lineage-destroyed": 160,
  "rollback-last-known-good-full": 0,
  "rollback-last-known-good-gated-unmarked": 5,
  "rollback-last-known-good-marked-weak-gate": 5,
  "rollback-last-known-good-weak-gate": 10,
  "hold-for-retrain-fully-validated-full-datacheck": 0,
  "hold-for-retrain-fully-validated-full-skipdatacheck": 0,
  "hold-for-retrain-fully-validated-gated-unmarked-datacheck": 4,
  "hold-for-retrain-fully-validated-gated-unmarked-skipdatacheck": 4,
  "hold-for-retrain-fully-validated-marked-weakgate-datacheck": 6,
  "hold-for-retrain-fully-validated-marked-weakgate-skipdatacheck": 6,
  "hold-for-retrain-fully-validated-weakgate-datacheck": 12,
  "hold-for-retrain-fully-validated-weakgate-skipdatacheck": 12,
  "hold-for-retrain-draining-validated": 18,
  "hold-for-retrain-draining-skip-datacheck": 28,
  "hold-for-retrain-just-engaged-pre-sustained": 20,
  "hold-for-retrain-just-engaged": 20,
  "quarantined-no-rollback-target": 22,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_800,
  perUnitMonthlyUsd: {
    // Alternate Strong Path B's real ongoing cost — holding promotion
    // open and running a full retrain-and-validate cycle spends real
    // compute every month it stays engaged, independent of which
    // rollback target was chosen.
    [`${ROLLBACK_TARGET_KEY}:hold-for-retrain`]: 520,
    // The direct cost-efficiency lever: a deeper validation pass on
    // every promotion attempt is a real, continuous infra spend.
    [`${VALIDATION_COMPUTE_TIER_KEY}:heavy`]: 340,
  },
};

/**
 * OPTIMAL: a trusted artifact is serving (zero corrupted output
 * reaching production, ever, on the live field), lineage remains fully
 * auditable, and future promotion requires real trust-validation —
 * closing the loop on business invariants #1 and #4, not merely
 * stopping today's exposure. Reachable via EITHER alternate strong
 * path: immediate rollback to last-known-good, or hold-for-retrain
 * once its full retrain-and-validate window has elapsed.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "currentServingArtifactTrustStatus", operator: "equals", comparedTo: "trusted" },
    { key: "lineageAuditStatus", operator: "equals", comparedTo: "complete" },
    { key: "artifactRiskStatus", operator: "equals", comparedTo: "healthy" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier this scenario
 * explicitly encourages — the corrupted artifact is no longer serving
 * live traffic AND lineage remains fully auditable (zero live
 * corrupted-model exposure, zero forensic damage), but at least one of
 * the two loop-closing controls (a hardened promotion gate for future
 * artifacts, or an explicit distrust marking on the corrupted record)
 * has not yet been engaged, or nothing trustworthy is serving yet
 * (mid-retrain, or quarantined with no rollback target chosen).
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "currentServingArtifactTrustStatus", operator: "not_equals", comparedTo: "corrupted-serving" },
    { key: "lineageAuditStatus", operator: "equals", comparedTo: "complete" },
    { key: "artifactRiskStatus", operator: "not_equals", comparedTo: "corrupted-exposure" },
    { key: "artifactRiskStatus", operator: "not_equals", comparedTo: "lineage-destroyed" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative business-decision exposure on the corrupted
 * model's output has run long enough, at a severe enough rate, to
 * constitute a catastrophic, irrecoverable business-risk collapse
 * within this attempt — not merely "still exposed." Gated on the
 * cumulative count (a real, counted number of actual bad decisions
 * already made), so a brief accidental flip is not instantly fatal but
 * a sustained keep-serving exposure window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "cumulativeDecisionsOnCorruptedModel", operator: "greater_than_or_equal", comparedTo: 400 }],
  sustainedSeconds: 30,
};
