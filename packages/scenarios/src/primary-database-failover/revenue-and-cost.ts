import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { REPLICA_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "primary-unavailable-unmitigated": 900,
  "split-primary-active": 40,
  "routing-not-cutover": 820,
  "failover-initiated-incomplete": 520,
  "primary-degrading": 260,
  "promoted-lag-drained-fenced": 0,
  "promoted-immediate-fenced-bounded-loss": 10,
  "promoted-immediate-fenced-undrained-loss": 10,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${REPLICA_COUNT_KEY}:1`]: 0,
    [`${REPLICA_COUNT_KEY}:2`]: 180,
    [`${REPLICA_COUNT_KEY}:3`]: 360,
  },
};

/**
 * Full recovery: write authority has genuinely moved to the replica
 * (writeAuthorityMode === "replica"), availability is fully healthy, and
 * — critically — there is no correctness residue at all: zero stale
 * writes (no split-primary hazard, ever) AND zero lost writes (the
 * cutover happened only once replication lag had actually drained).
 * This is reached only by lag-drained-fenced-recovery in rules.ts.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "writeAuthorityMode", operator: "equals", comparedTo: "replica" },
    { key: "writeSuccessRatePct", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "primaryStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "splitPrimaryActive", operator: "equals", comparedTo: "inactive" },
    { key: "staleWriteCount", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "lostWriteCount", operator: "less_than_or_equal", comparedTo: 0 },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: write authority has moved to the replica,
 * availability is fully healthy, and the split-primary hazard is fully
 * closed (fenced, staleWriteCount stays at 0 — no ONGOING violation).
 * lostWriteCount is allowed to be a small, bounded, non-growing residue
 * from promoting before lag fully drained — a genuine, accounted-for
 * tradeoff per phase6b.md section 9 ("the system is operationally safe
 * enough to hand back even though it is not the best achievable state"),
 * never a disguised ongoing corruption. The bound (200) is comfortably
 * above both bounded-loss rules' authored lostWriteCount (40 and 95) and
 * far below anything the split-primary trap could ever reach if it were
 * (incorrectly) measured by this same field.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "writeAuthorityMode", operator: "equals", comparedTo: "replica" },
    { key: "writeSuccessRatePct", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "primaryStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "splitPrimaryActive", operator: "equals", comparedTo: "inactive" },
    { key: "staleWriteCount", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "lostWriteCount", operator: "less_than_or_equal", comparedTo: 200 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "writeSuccessRatePct", operator: "less_than_or_equal", comparedTo: 10 }],
  sustainedSeconds: 60,
};
