import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  EU_TRAFFIC_PERCENTAGE_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
} from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "eu-degraded-only": 300,
  "baseline-unmitigated": 650,
  "fraud-controls-bypassed": 900,
  "divergent-ledger-authority": 1_400,
  "divergent-ledger-authority-severe": 2_600,
  "us-ledger-overloaded": 2_200,
  "ledger-fixed-partial-shift-unprotected": 430,
  "cached-rules-partial-protection": 420,
  "protected-shift-draining": 180,
  "protected-shift-recovered": 0,
  "protected-shift-event-deferred-draining": 150,
  "paused-replication-protected-draining": 160,
  "alternate-conservative-shift-draining": 140,
  "alternate-conservative-shift-recovered": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_800,
  perUnitMonthlyUsd: {
    [`${SETTLEMENT_WORKER_PRIORITY_KEY}:critical-path-first`]: 220,
    [`${EU_TRAFFIC_PERCENTAGE_KEY}:0`]: 140,
    [`${EU_TRAFFIC_PERCENTAGE_KEY}:40`]: 60,
    [`${EU_TRAFFIC_PERCENTAGE_KEY}:70`]: 20,
  },
};

/**
 * Full recovery (OPTIMAL): zero divergent-ledger-authority events, zero
 * fraud-control bypasses, ledger write authority has been structurally
 * fixed (ledgerAuthorityMechanism === "us-authoritative-routed" -- this
 * is what distinguishes a genuinely protected, mitigated state from the
 * untouched baseline, which also happens to read low on
 * utilization/backlog simply because no traffic has been shifted onto
 * US yet), ledger replication lag has drained to a genuinely low value,
 * and settlement backlog has drained to zero. This is only reachable
 * via catchUpWindowElapsed=true AND a control combination that actually
 * relieved write pressure (see rules.ts) -- a candidate who dumped 100%
 * of EU traffic onto US with no settlement protection never reaches
 * ledgerReplicationLagSeconds this low, no matter how much simulated
 * time passes, because usLedgerUtilization/settlementBacklogThousands
 * stay pinned at the authored "us-ledger-overloaded" values that rule
 * continues to hold while that control combination remains in effect.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "divergentLedgerAuthorityCount", operator: "equals", comparedTo: 0 },
    { key: "fraudControlBypassCount", operator: "equals", comparedTo: 0 },
    { key: "ledgerAuthorityMechanism", operator: "equals", comparedTo: "us-authoritative-routed" },
    { key: "ledgerReplicationLagSeconds", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "settlementBacklogThousands", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: no correctness violation (zero divergence, zero
 * fraud bypass), the structural ledger-authority fix has actually been
 * applied (ledgerAuthorityMechanism === "us-authoritative-routed" --
 * the same gate successCondition uses, which is what keeps the
 * untouched baseline from accidentally qualifying here: baseline never
 * sets this field away from its initial "region-local-safe"), and
 * settlement backlog is genuinely draining (bounded, not climbing) even
 * though it has not fully cleared yet, with ledger utilization back
 * under its safe ceiling. This recognizes the alternate-strong-path/
 * protected-but-still-draining states as a legitimate, bounded,
 * safe-but-imperfect tradeoff distinct from the fully-drained optimal
 * tier -- see definition.ts's completion-mode audit for which real
 * rule states satisfy this versus successCondition.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "divergentLedgerAuthorityCount", operator: "equals", comparedTo: 0 },
    { key: "fraudControlBypassCount", operator: "equals", comparedTo: 0 },
    { key: "ledgerAuthorityMechanism", operator: "equals", comparedTo: "us-authoritative-routed" },
    { key: "usLedgerUtilization", operator: "less_than_or_equal", comparedTo: 95 },
    { key: "settlementBacklogThousands", operator: "less_than_or_equal", comparedTo: 6 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run of severe, ongoing correctness damage (real
 * divergent ledger writes keep accumulating) OR the US ledger/settlement
 * subsystem has been left overloaded long enough that it is now itself
 * failing outright. Either is a genuine, irreversible-risk collapse --
 * not merely "still degraded."
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "divergentLedgerAuthorityCount", operator: "greater_than_or_equal", comparedTo: 25 },
  ],
  sustainedSeconds: 60,
};
