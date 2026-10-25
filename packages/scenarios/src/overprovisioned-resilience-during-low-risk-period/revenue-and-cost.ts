import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "./controls";

/**
 * This scenario poses no live availability incident, by design — every
 * reachable rule state keeps requestSuccessRate/p99LatencyMs healthy
 * except the below-floor-AND-drill-hit family. revenueLossRatePerMinute
 * is therefore nonzero ONLY for those drill-hit states (a real, if
 * brief, customer-facing consequence of the floor violation actually
 * being exercised) — every quiet/safe/wasteful state loses no revenue
 * at all, which is the honest modeling choice for "nothing is broken."
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "unreviewed-peak-posture-baseline": 0,
  "unreviewed-peak-posture-sustained": 0,
  "safe-reduction-compute-first-engaging": 0,
  "safe-reduction-compute-first-settled": 0,
  "safe-reduction-data-plane-first-engaging": 0,
  "safe-reduction-data-plane-first-settled": 0,
  "partial-safe-reduction-az-still-peak": 0,
  "backup-floor-violation-silent": 0,
  "az-floor-violation-quiet": 0,
  "failover-reserve-floor-violation-quiet": 0,
  "az-floor-violation-drill-hit": 180,
  "az-floor-violation-drill-hit-second": 260,
  "failover-reserve-floor-violation-drill-hit": 110,
  "failover-reserve-floor-violation-drill-hit-second": 170,
};

/**
 * Mirrors the live monthlyInfrastructureCostUsd authored per rule state
 * via each control's own per-unit delta from the baseline, so
 * costIncreaseRatio reads a real, distinct, honest number per path
 * rather than a flat authored constant. Every control that exists in
 * this scenario carries a real monthly cost delta, including the two
 * controls (replicaCount, warmCapacity, standbyFleet,
 * databaseReplicaClass, prewarmedCacheCapacity) that are NOT part of the
 * mandatory resilience floor — proving a candidate cannot get a free,
 * costless win by leaving every control at its most expensive setting
 * "just to be safe": that is exactly the unreviewed-peak-posture
 * baseline, and it costs real, avoidable money every month it continues.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 48_000,
  perUnitMonthlyUsd: {
    [`${REPLICA_COUNT_KEY}:peak-event`]: 0,
    [`${REPLICA_COUNT_KEY}:baseline-operating`]: -5_500,
    [`${REPLICA_COUNT_KEY}:minimum`]: -8_000,
    [`${WARM_CAPACITY_KEY}:full`]: 0,
    [`${WARM_CAPACITY_KEY}:reduced`]: -2_500,
    [`${WARM_CAPACITY_KEY}:none`]: -4_000,
    [`${MULTI_AZ_MODE_KEY}:active-active`]: 0,
    [`${MULTI_AZ_MODE_KEY}:single-az-with-standby`]: -4_000,
    [`${MULTI_AZ_MODE_KEY}:single-az-only`]: -9_000,
    [`${FAILOVER_RESERVE_KEY}:peak-reserved`]: 0,
    [`${FAILOVER_RESERVE_KEY}:baseline-reserved`]: -3_000,
    [`${FAILOVER_RESERVE_KEY}:none`]: -7_000,
    [`${STANDBY_FLEET_KEY}:full`]: 0,
    [`${STANDBY_FLEET_KEY}:reduced`]: -1_800,
    [`${STANDBY_FLEET_KEY}:none`]: -3_200,
    [`${DATABASE_REPLICA_CLASS_KEY}:peak-sized`]: 0,
    [`${DATABASE_REPLICA_CLASS_KEY}:baseline-sized`]: -3_500,
    [`${DATABASE_REPLICA_CLASS_KEY}:undersized`]: -5_500,
    [`${BACKUP_FREQUENCY_KEY}:high-frequency`]: 0,
    [`${BACKUP_FREQUENCY_KEY}:standard`]: -1_500,
    [`${BACKUP_FREQUENCY_KEY}:minimal`]: -3_500,
    [`${PREWARMED_CACHE_CAPACITY_KEY}:peak-sized`]: 0,
    [`${PREWARMED_CACHE_CAPACITY_KEY}:baseline-sized`]: -1_200,
    [`${PREWARMED_CACHE_CAPACITY_KEY}:minimal`]: -2_000,
  },
};

/**
 * OPTIMAL: the mandatory resilience floor is intact (resilienceFloorStatus
 * = "at-floor-or-above") AND a genuine, non-trivial cost reduction has
 * actually been made (costPostureStatus = "reduced-to-baseline-safe") —
 * reachable via EITHER alternate strong path (compute-first or
 * data-plane-first), since this condition never constrains WHICH
 * controls were reduced, only that the floor held and real savings were
 * realized. Never satisfied by the wasteful-but-safe baseline (floor
 * intact, nothing reduced) — that configuration is SAFE but does not
 * resolve the actual incident this scenario poses (needless cost).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "resilienceFloorStatus", operator: "equals", comparedTo: "at-floor-or-above" },
    { key: "costPostureStatus", operator: "equals", comparedTo: "reduced-to-baseline-safe" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the floor is intact AND a real, deliberate reduction has
 * genuinely been made (costPostureStatus = "reduced-partial-safe") —
 * but the mandatory-floor controls themselves were deliberately left at
 * their most expensive setting rather than also moved down to the
 * stated baseline (partial-safe-reduction-az-still-peak in rules.ts).
 * This is a genuine, bounded judgment call distinct from OPTIMAL: safe,
 * and real (if incomplete) savings were realized, but the candidate
 * chose not to also right-size the AZ/failover posture itself. Requires
 * a real candidate action — NEVER satisfied by the wasteful-but-safe
 * zero-action baseline (costPostureStatus stays "unreviewed-peak-posture"
 * there, never "reduced-partial-safe"), which is deliberately excluded
 * so this condition can never resolve a zero-action Finish (phase6e2.md
 * requirement 10's immediate-Finish audit).
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "resilienceFloorStatus", operator: "equals", comparedTo: "at-floor-or-above" },
    { key: "costPostureStatus", operator: "equals", comparedTo: "reduced-partial-safe" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: the mandatory floor has been violated for long enough, and
 * exercised by enough periodic drills, that the exposure constitutes a
 * severe, repeated operational failure within this attempt — gated on
 * the real cumulative count of drills the floor failed to absorb (never
 * merely "the floor is currently violated"), so a brief misconfiguration
 * corrected before the next drill is not instantly fatal, but leaving
 * the floor violated across multiple real drills is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeUnabsorbedFailoverDrillCount", operator: "greater_than_or_equal", comparedTo: 2 },
  ],
  sustainedSeconds: 30,
};
