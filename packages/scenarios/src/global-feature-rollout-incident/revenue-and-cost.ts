import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { MIGRATION_REPAIR_KEY, WRITE_COMPATIBILITY_MODE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-diverging": 160,
  "sustained-widening": 420,
  "catastrophic-widening": 700,
  "racing-repair": 200,
  "rollback-no-repair-unreadable": 140,
  "rollback-with-shim": 10,
  "repaired-fully": 0,
  "repair-just-started": 90,
  "repairing-window1": 70,
  "repairing-window2": 35,
  "dual-write-contained": 60,
  "eu-halted-only": 120,
  "us-halted-only": 120,
  "paused-still-writing": 130,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 1_400,
  perUnitMonthlyUsd: {
    [`${WRITE_COMPATIBILITY_MODE_KEY}:dual-write`]: 260,
    [`${MIGRATION_REPAIR_KEY}:repairing`]: 180,
  },
};

/**
 * OPTIMAL: every region's correctness rate fully restored, the
 * already-written backlog resolved (either genuinely repaired —
 * repairedRecordCount === alreadyIncompatibleWriteCount — or made
 * mutually readable via the compatibility shim), zero unreadable reads,
 * and the store compatibility status explicitly "compatible" — only
 * reachable via repair-fully-done-growth-stopped,
 * repair-fully-done-global-rollback, or
 * global-rollback-with-compatibility-shim in rules.ts, each requiring a
 * genuine growth-stopped precondition plus either the full repair
 * window or the read-compatibility shim.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "unreadableReadCount", operator: "equals", comparedTo: 0 },
    { key: "storeCompatibilityStatus", operator: "equals", comparedTo: "compatible" },
    { key: "euCorrectnessRate", operator: "equals", comparedTo: 100 },
    { key: "usCorrectnessRate", operator: "equals", comparedTo: 100 },
    { key: "apacCorrectnessRate", operator: "equals", comparedTo: 100 },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the forward-fix/staged-continuation tier — dual-write
 * engaged fleet-wide, which stops NEW incompatibility from being
 * created, but the pre-existing backlog from before dual-write was
 * engaged remains genuinely unrepaired (storeCompatibilityStatus stays
 * "contained", never "compatible"). A real, deliberate, bounded
 * tradeoff distinct from OPTIMAL only in leaving a known, non-growing,
 * already-written backlog outstanding rather than requiring it to be
 * fully resolved before handback.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "storeCompatibilityStatus", operator: "equals", comparedTo: "contained" },
    { key: "rolloutStatus", operator: "equals", comparedTo: "active-dual-write" },
    { key: "unreadableReadCount", operator: "less_than_or_equal", comparedTo: 30 },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: the already-incompatible write backlog has grown large
 * enough, for long enough, to constitute a catastrophic, irrecoverable
 * correctness collapse within this attempt. Gated on the cumulative
 * count (a real, counted number of actual incompatible writes), not the
 * instantaneous rate, so a brief exposure window is not instantly fatal
 * but sustained unmitigated widening is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "alreadyIncompatibleWriteCount", operator: "greater_than_or_equal", comparedTo: 1_500 },
  ],
  sustainedSeconds: 30,
};
