import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { QUORUM_VOTING_SET_SIZE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "spurious-elections-worst-case": 900,
  "spurious-elections-aggressive-retries": 760,
  "spurious-elections-plus-real-crash": 840,
  "spurious-elections-node3-degrading": 620,
  "spurious-elections-baseline": 520,
  "excessive-timeout-slow-failover": 480,
  "timeout-fixed-heartbeat-too-sparse": 140,
  "margin-fixed-failing-over": 70,
  "excessive-timeout-quiet-but-unproven": 0,
  "excessive-timeout-quiet-node3-degrading": 0,
  "excessive-timeout-settled": 0,
  "margin-fixed-stable": 0,
  "margin-fixed-stable-degrading": 0,
  "margin-fixed-settled": 0,
  "isolated-stable": 0,
  "isolated-stable-degrading": 0,
  "isolated-unaffected-by-crash": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 300,
  perUnitMonthlyUsd: {
    [`${QUORUM_VOTING_SET_SIZE_KEY}:3`]: 0,
    [`${QUORUM_VOTING_SET_SIZE_KEY}:5`]: 180,
  },
};

/**
 * Full recovery: zero spurious elections, full quorum fault-tolerance
 * margin intact (quorumHealth === "normal" — the voting set is still 3
 * nodes, able to lose one more and keep quorum), and a real, named
 * stability mechanism. Gating on electionStabilityMechanism rather than
 * only the numeric metrics is deliberate — the excessive-timeout path
 * reads identically quiet during the jitter-only window (see rules.ts)
 * but never earns "margin-fixed"; it stays "unresolved" because the fix
 * was oversized, not proportionate, and its real cost only shows up in
 * the crash-phase rules. Requiring quorumHealth === "normal" specifically
 * (rather than merely not-critical) is what separates this from the
 * acceptable tier below: the isolation path is genuinely stable but
 * trades away the cluster's remaining fault-tolerance margin to get
 * there.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "leaderChangesPerMinute", operator: "equals", comparedTo: 0 },
    { key: "quorumHealth", operator: "equals", comparedTo: "normal" },
    { key: "electionStabilityMechanism", operator: "equals", comparedTo: "margin-fixed" },
  ],
  sustainedSeconds: 20,
};

/**
 * Acceptable handback: the voting set has genuinely shrunk to 2 —
 * either because the candidate deliberately isolated node-3
 * (electionStabilityMechanism === "node-isolated") or because node-3
 * actually crashed and the margin-fixed mechanism correctly failed over
 * away from it (electionStabilityMechanism === "margin-fixed" with
 * quorumHealth === "no-slack" post-settlement). Both reach a state
 * where every customer-facing metric is genuinely healthy and stays
 * that way, but the cluster now tolerates zero further voter loss —
 * quorumHealth reads "no-slack" rather than "normal". This generalizes
 * phase6b.md section 9's "regional traffic isolated with known reduced
 * redundancy" example directly: a deliberate (or, after a real crash,
 * forced) tradeoff of resilience margin that is genuinely safe right
 * now, not a partial or "almost passed" fix. Excludes
 * excessive-timeout-settled, which also reads quorumHealth="no-slack"
 * after settling but never earns a real electionStabilityMechanism
 * (stays "unresolved") — its quiet state was never actually proven safe
 * against jitter, only against a failure that has already happened.
 * See definition.ts's completion-mode audit.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "leaderChangesPerMinute", operator: "equals", comparedTo: 0 },
    { key: "quorumHealth", operator: "equals", comparedTo: "no-slack" },
    { key: "electionStabilityMechanism", operator: "not_equals", comparedTo: "unresolved" },
  ],
  sustainedSeconds: 20,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "quorumHealth", operator: "equals", comparedTo: "critical" }],
  sustainedSeconds: 90,
};
