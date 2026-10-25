import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { WORKER_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "aggressive-mass-duplication-amplified": 820,
  "aggressive-mass-duplication": 680,
  "staleness-widened-orphaning": 760,
  "conservative-baseline-orphaning": 560,
  "fenced-conservative-orphaning": 420,
  "faster-heartbeat-no-effect": 540,
  "short-lease-partial-relief": 300,
  "fenced-aggressive-churning": 170,
  "reconciled-unfenced-residual-duplication": 70,
  "reconciled-fenced-safe": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${WORKER_CONCURRENCY_KEY}:4`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:8`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:16`]: 300,
    [`${WORKER_CONCURRENCY_KEY}:32`]: 760,
  },
};

/**
 * Full recovery: both root-cause mechanisms are in place —
 * reconciliation (fixes the stale ownership table itself, closing both
 * the conflict and missed-work populations) and fencing (makes the
 * residual window around each reconciliation pass safe against any
 * duplicate completion). ownershipIntegrityMode === "reconciled" is the
 * single field that distinguishes this from every other low-numbers
 * state — see completion-mode audit in definition.ts for why no
 * intermediate state qualifies as acceptable.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "ownershipConflictCount", operator: "equals", comparedTo: 0 },
    { key: "missedWorkItemCount", operator: "equals", comparedTo: 0 },
    { key: "duplicateWorkCompletedCount", operator: "equals", comparedTo: 0 },
    { key: "coordinationServiceStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "ownershipIntegrityMode", operator: "equals", comparedTo: "reconciled" },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: the backlog of unowned/unprocessed work items has grown
 * large enough, for long enough, that the batch can no longer be
 * considered recoverable on any realistic timeline — the conservative-
 * baseline and staleness-widened orphaning paths reach this if left
 * unmitigated.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "schedulerBacklogCount", operator: "greater_than_or_equal", comparedTo: 850 }],
  sustainedSeconds: 60,
};
