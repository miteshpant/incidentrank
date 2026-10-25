import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { REPAIR_QUEUE_PRIORITY_KEY, SETTLEMENT_WRITE_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-diverging": 150,
  "baseline-sustained-diverging": 320,
  "exceptions-discarded": 60,
  "exceptions-discarded-sustained": 90,
  "replay-unsafe-amplified": 260,
  "concurrency-amplified-damage": 340,
  "frozen-consumer-paused": 420,
  "frozen-consumer-paused-sustained": 520,
  "frozen-publisher-fixed-passive-detect": 60,
  "frozen-routed-not-repairing": 50,
  "repair-just-engaged-sustained": 55,
  "repair-just-engaged-early": 30,
  "draining-sustained-window1-expedited": 35,
  "draining-sustained-window1-normal": 45,
  "draining-sustained-window2-expedited": 15,
  "draining-sustained-window2-normal": 25,
  "draining-early-window1-expedited": 10,
  "draining-early-window1-normal": 15,
  "fully-reconciled": 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_400,
  perUnitMonthlyUsd: {
    [`${REPAIR_QUEUE_PRIORITY_KEY}:expedited`]: 260,
    [`${SETTLEMENT_WRITE_CONCURRENCY_KEY}:high`]: 180,
  },
};

/**
 * OPTIMAL: new divergence stopped (newDivergenceRatePerMinute = 0),
 * every historical correctness counter has fully drained to zero
 * (missingEntryCount, duplicateSettlementEntryCount,
 * reconciliationBacklogCount all 0), no acknowledged record was ever
 * discarded (discardedAcknowledgedEntryCount = 0), and
 * reconciliationStatus explicitly reads "reconciled" — only reachable
 * via fully-reconciled in rules.ts, which itself requires BOTH the
 * publisher fix AND fully-engaged repair AND the longest elapsed
 * repair-time window. A candidate who merely paused the consumer or
 * left reconciliation passive never reaches this regardless of elapsed
 * time, because reconciliationBacklogCount stays pinned at its frozen
 * value in those rule states.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "newDivergenceRatePerMinute", operator: "equals", comparedTo: 0 },
    { key: "missingEntryCount", operator: "equals", comparedTo: 0 },
    { key: "duplicateSettlementEntryCount", operator: "equals", comparedTo: 0 },
    { key: "reconciliationBacklogCount", operator: "equals", comparedTo: 0 },
    { key: "discardedAcknowledgedEntryCount", operator: "equals", comparedTo: 0 },
    { key: "reconciliationStatus", operator: "equals", comparedTo: "reconciled" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the bounded-but-not-fully-healthy safe degraded state
 * (phase6d.2.md section 9's explicit potential-acceptable-state
 * language). New divergence has genuinely stopped, no acknowledged
 * record has been discarded, and the backlog is BOUNDED (below a real
 * authored ceiling, never the frozen "it never moves" value of
 * 230/78) AND the state is explicitly "draining" (not "frozen-
 * unrepaired") — reconciliationStatus is the gate that keeps a frozen-
 * but-quiet state (consumer paused, or passive-detect) from
 * accidentally qualifying here, since in both of those
 * reconciliationBacklogCount sits at 230/78, well above this
 * condition's ceiling only by coincidence of the specific authored
 * numbers chosen — the EXPLICIT reconciliationStatus = "draining"
 * check is what actually enforces "demonstrably progressing," per
 * phase6d.2.md section 10's "bounded historical recovery still
 * draining only if ... recovery is demonstrably progressing."
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "newDivergenceRatePerMinute", operator: "equals", comparedTo: 0 },
    { key: "discardedAcknowledgedEntryCount", operator: "equals", comparedTo: 0 },
    { key: "reconciliationBacklogCount", operator: "less_than_or_equal", comparedTo: 120 },
    { key: "reconciliationStatus", operator: "equals", comparedTo: "draining" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: discarded-acknowledged-entries has run long enough to reach
 * a severe, unrecoverable count — an irreversible correctness collapse,
 * not merely "still degraded." This is the one genuinely catastrophic
 * outcome in this scenario: deleting enough acknowledged financial
 * records that the Operational Ledger's authority can no longer be
 * reconciled against what Settlement believes happened.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "discardedAcknowledgedEntryCount", operator: "greater_than_or_equal", comparedTo: 200 },
  ],
  sustainedSeconds: 30,
};
