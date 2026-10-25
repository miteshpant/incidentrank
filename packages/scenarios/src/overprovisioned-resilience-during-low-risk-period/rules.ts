import type { ComponentHealth, Rule } from "@incidentrank/simulator";
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

const healthyHealth: Record<string, ComponentHealth> = {
  "global-router": "healthy",
  "service-fleet": "healthy",
  "multi-az-capacity": "healthy",
  "database-primary": "healthy",
  "read-replicas": "healthy",
};

const belowFloorQuietHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "multi-az-capacity": "degraded",
};

const belowFloorDrillHitHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "multi-az-capacity": "critical",
  "database-primary": "degraded",
};

const safeReducedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
};

/**
 * Authored rule table for Overprovisioned Resilience During Low-Risk
 * Period, ordered most-specific-first: mandatory-floor violations
 * (checked first — they win regardless of how much, or how little,
 * money has been saved, and regardless of how healthy every live metric
 * currently reads), then the two alternate legitimate safe-reduction
 * paths, then the wasteful-but-safe unreviewed baseline, then a
 * healthy-default fallback.
 *
 * ── THE CORE LESSON (phase6e2.md's binding requirement for this
 * scenario): a configuration can be below the mandatory resilience
 * floor and show a 100% green dashboard RIGHT NOW. requestSuccessRate
 * and p99LatencyMs NEVER move for being below the floor by itself —
 * they only move once the periodic single-AZ failure drill
 * (timed-events.ts) actually fires AND finds the floor violated. This
 * is the authored, concrete failure-exposure window the mandatory floor
 * exists to protect against: a low-probability, periodic, real event,
 * not a hypothetical policy violation with no teeth.
 *
 * ── MANDATORY FLOOR DEFINITION — resilienceFloorStatus reads
 * "below-floor" whenever ANY of:
 *   - multiAzMode = "single-az-only" (no failover target at all), OR
 *   - failoverReserve = "none" (a failover target exists but there is
 *     no reserved capacity to actually serve traffic that fails over to
 *     it), OR
 *   - backupFrequency = "minimal" (the durability/recovery-point
 *     guarantee itself is violated — a distinct floor dimension from
 *     the AZ/failover posture, surfaced through the SAME status field
 *     because both are "the mandatory resilience floor" per this
 *     scenario's business invariants, but tracked by a SEPARATE
 *     historical counter where the drill consequence specifically
 *     requires the AZ/failover half of the floor — see
 *     cumulativeUnabsorbedFailoverDrillCount's doc comment in metrics.ts).
 * None of replicaCount, warmCapacity, standbyFleet, or
 * databaseReplicaClass/prewarmedCacheCapacity participate in the
 * mandatory floor at all — they may be reduced all the way to their
 * cheapest value with zero floor consequence, which is exactly why two
 * independently-legitimate cost-reduction strategies exist below.
 *
 * ── HISTORICAL DAMAGE MODEL — cumulativeUnabsorbedFailoverDrillCount
 * only increments at the moment a drill trigger (firstDrillFired /
 * secondDrillFired) fires WHILE the AZ/failover half of the floor
 * (multiAzMode/failoverReserve) is violated — mirroring every other
 * built-in scenario's non-resetting historical-counter convention
 * (authored snapshot per trigger window, never runtime arithmetic).
 * Restoring the floor afterward stops future increments but never
 * decrements the live value in the restored rule family, and
 * state.peaks.peakValues (trackPeak: true) proves the peak itself never
 * decreases even then — see the test file's explicit non-reset proof.
 */
export const overprovisionedResilienceDuringLowRiskPeriodRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // MANDATORY-FLOOR VIOLATIONS — checked first, win regardless of every
  // other control. Below-floor-but-quiet (no drill has fired yet) is
  // STILL unsafe (resilienceFloorStatus = "below-floor") even though
  // every live health metric reads green — the required green-
  // dashboard-is-not-safety trap. Below-floor-and-drill-hit shows the
  // real, concrete consequence once the authored exposure event fires.
  // ══════════════════════════════════════════════════════════════════

  // Backup-frequency floor violation alone (durability guarantee
  // violated), independent of AZ/failover posture — invisible on every
  // live metric by design (a backup-frequency violation has no
  // availability signature at all; it is a pure, silent durability
  // exposure), which is exactly why it must be penalized on
  // dataIntegrity, never discoverable by watching dashboards.
  {
    id: "backup-floor-violation-silent",
    when: {
      triggerEquals: { highRiskWindowEnded: true },
      controlEquals: { [BACKUP_FREQUENCY_KEY]: "minimal" },
    },
    incidentState: "backup-floor-violation-silent",
    values: {
      requestSuccessRate: 99.95,
      p99LatencyMs: 90,
      monthlyInfrastructureCostUsd: 44_500,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: healthyHealth,
  },

  // AZ/failover floor violated, drill has NOT fired yet — quiet,
  // green-dashboard, genuinely unsafe. This is the core trap state.
  {
    id: "az-floor-violation-quiet",
    when: {
      triggerEquals: { highRiskWindowEnded: true, firstDrillFired: false },
      controlEquals: { [MULTI_AZ_MODE_KEY]: "single-az-only" },
    },
    incidentState: "az-floor-violation-quiet",
    values: {
      requestSuccessRate: 99.95,
      p99LatencyMs: 90,
      // Deliberately authored LOWER than either safe-reduction path's
      // settled cost (30_500 / 33_000) — this rule matches regardless
      // of what any other control is set to, so it represents the
      // "minimize everything, including the floor" temptation: the
      // single cheapest reachable live cost in the entire scenario,
      // which is exactly why it must be penalized hard enough elsewhere
      // (dataIntegrity/reliability) to still lose overall. See
      // scoring.ts's score-sanity audit.
      monthlyInfrastructureCostUsd: 26_000,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: belowFloorQuietHealth,
  },
  // Same violation, but via a released failover reserve instead of
  // (or in addition to) removing the AZ target itself — a target exists
  // but there is no spare capacity to actually serve traffic once it
  // arrives there, which is just as unsafe.
  {
    id: "failover-reserve-floor-violation-quiet",
    when: {
      triggerEquals: { highRiskWindowEnded: true, firstDrillFired: false },
      controlEquals: { [FAILOVER_RESERVE_KEY]: "none" },
    },
    incidentState: "failover-reserve-floor-violation-quiet",
    values: {
      requestSuccessRate: 99.95,
      p99LatencyMs: 90,
      monthlyInfrastructureCostUsd: 41_000,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: belowFloorQuietHealth,
  },

  // AZ/failover floor violated AND a drill has now fired: the real,
  // visible, authored consequence. requestSuccessRate and p99LatencyMs
  // move for the FIRST time in this entire state family — proving the
  // earlier "quiet" state really was unsafe, not merely theoretically
  // so. The historical counter increments by 1 per drill the floor
  // stayed violated through.
  {
    id: "az-floor-violation-drill-hit-second",
    when: {
      triggerEquals: { highRiskWindowEnded: true, secondDrillFired: true },
      controlEquals: { [MULTI_AZ_MODE_KEY]: "single-az-only" },
    },
    incidentState: "az-floor-violation-drill-hit-second",
    values: {
      requestSuccessRate: 91,
      p99LatencyMs: 2_400,
      monthlyInfrastructureCostUsd: 26_000,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 2,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: belowFloorDrillHitHealth,
  },
  {
    id: "az-floor-violation-drill-hit",
    when: {
      triggerEquals: { highRiskWindowEnded: true, firstDrillFired: true },
      controlEquals: { [MULTI_AZ_MODE_KEY]: "single-az-only" },
    },
    incidentState: "az-floor-violation-drill-hit",
    values: {
      requestSuccessRate: 94,
      p99LatencyMs: 1_800,
      monthlyInfrastructureCostUsd: 26_000,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 1,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: belowFloorDrillHitHealth,
  },
  {
    id: "failover-reserve-floor-violation-drill-hit-second",
    when: {
      triggerEquals: { highRiskWindowEnded: true, secondDrillFired: true },
      controlEquals: { [FAILOVER_RESERVE_KEY]: "none" },
    },
    incidentState: "failover-reserve-floor-violation-drill-hit-second",
    values: {
      requestSuccessRate: 93,
      p99LatencyMs: 2_100,
      monthlyInfrastructureCostUsd: 41_000,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 2,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: belowFloorDrillHitHealth,
  },
  {
    id: "failover-reserve-floor-violation-drill-hit",
    when: {
      triggerEquals: { highRiskWindowEnded: true, firstDrillFired: true },
      controlEquals: { [FAILOVER_RESERVE_KEY]: "none" },
    },
    incidentState: "failover-reserve-floor-violation-drill-hit",
    values: {
      requestSuccessRate: 95.5,
      p99LatencyMs: 1_500,
      monthlyInfrastructureCostUsd: 41_000,
      resilienceFloorStatus: "below-floor",
      cumulativeUnabsorbedFailoverDrillCount: 1,
      costPostureStatus: "reduced-below-floor",
    },
    componentHealth: belowFloorDrillHitHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — compute/standby-first reduction. Floor is
  // fully intact (multiAzMode at or above single-az-with-standby,
  // failoverReserve at or above baseline-reserved, backupFrequency at
  // or above standard); the candidate instead cuts compute/standby
  // capacity (replicaCount, warmCapacity, standbyFleet) down toward the
  // operating baseline. Requires the settle window to have elapsed —
  // not instant on the same tick a control is changed.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-reduction-compute-first-settled",
    when: {
      triggerEquals: { highRiskWindowEnded: true, reductionSettleWindowElapsed: true },
      controlEquals: {
        [MULTI_AZ_MODE_KEY]: "single-az-with-standby",
        [FAILOVER_RESERVE_KEY]: "baseline-reserved",
        [REPLICA_COUNT_KEY]: "baseline-operating",
        [WARM_CAPACITY_KEY]: "reduced",
        [STANDBY_FLEET_KEY]: "reduced",
      },
    },
    incidentState: "safe-reduction-compute-first-settled",
    values: {
      requestSuccessRate: 99.9,
      p99LatencyMs: 105,
      monthlyInfrastructureCostUsd: 30_500,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-to-baseline-safe",
    },
    componentHealth: safeReducedHealth,
  },
  // Same strategy, reduction just engaged — real, distinct, not-yet-
  // settled numbers proving the settle window is not instantaneous.
  {
    id: "safe-reduction-compute-first-engaging",
    when: {
      triggerEquals: { highRiskWindowEnded: true, reductionSettleWindowElapsed: false },
      controlEquals: {
        [MULTI_AZ_MODE_KEY]: "single-az-with-standby",
        [FAILOVER_RESERVE_KEY]: "baseline-reserved",
        [REPLICA_COUNT_KEY]: "baseline-operating",
        [WARM_CAPACITY_KEY]: "reduced",
        [STANDBY_FLEET_KEY]: "reduced",
      },
    },
    incidentState: "safe-reduction-compute-first-engaging",
    values: {
      requestSuccessRate: 99.7,
      p99LatencyMs: 160,
      monthlyInfrastructureCostUsd: 36_000,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-to-baseline-safe",
    },
    componentHealth: safeReducedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — data-plane-first reduction. Floor fully
  // intact; compute/standby capacity is left alone (full headroom
  // preserved), while database sizing and cache sizing are reduced
  // toward baseline instead. Reaches a genuinely different cost/risk
  // mix than Path A: less aggregate cost saved on compute, but the
  // read/write data path is leaner, and compute headroom is fully
  // preserved for any ordinary traffic variance.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-reduction-data-plane-first-settled",
    when: {
      triggerEquals: { highRiskWindowEnded: true, reductionSettleWindowElapsed: true },
      controlEquals: {
        [MULTI_AZ_MODE_KEY]: "single-az-with-standby",
        [FAILOVER_RESERVE_KEY]: "baseline-reserved",
        [DATABASE_REPLICA_CLASS_KEY]: "baseline-sized",
        [PREWARMED_CACHE_CAPACITY_KEY]: "baseline-sized",
        [BACKUP_FREQUENCY_KEY]: "standard",
      },
    },
    incidentState: "safe-reduction-data-plane-first-settled",
    values: {
      requestSuccessRate: 99.92,
      p99LatencyMs: 115,
      monthlyInfrastructureCostUsd: 33_000,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-to-baseline-safe",
    },
    componentHealth: safeReducedHealth,
  },
  {
    id: "safe-reduction-data-plane-first-engaging",
    when: {
      triggerEquals: { highRiskWindowEnded: true, reductionSettleWindowElapsed: false },
      controlEquals: {
        [MULTI_AZ_MODE_KEY]: "single-az-with-standby",
        [FAILOVER_RESERVE_KEY]: "baseline-reserved",
        [DATABASE_REPLICA_CLASS_KEY]: "baseline-sized",
        [PREWARMED_CACHE_CAPACITY_KEY]: "baseline-sized",
        [BACKUP_FREQUENCY_KEY]: "standard",
      },
    },
    incidentState: "safe-reduction-data-plane-first-engaging",
    values: {
      requestSuccessRate: 99.75,
      p99LatencyMs: 180,
      monthlyInfrastructureCostUsd: 38_500,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-to-baseline-safe",
    },
    componentHealth: safeReducedHealth,
  },

  // Floor intact, full active-active still engaged, but a candidate has
  // reduced non-floor controls anyway while LEAVING multiAzMode at its
  // most expensive setting — still safe, still a real (smaller) cost
  // saving, but not either of the two canonical strategies above (both
  // of which also move multiAzMode/failoverReserve down to their
  // baseline value, not merely leave them at peak). Demonstrates a
  // partial-credit-shaped middle ground exists without inventing a
  // third full strategy.
  {
    id: "partial-safe-reduction-az-still-peak",
    when: {
      triggerEquals: { highRiskWindowEnded: true, reductionSettleWindowElapsed: true },
      controlEquals: {
        [MULTI_AZ_MODE_KEY]: "active-active",
        [REPLICA_COUNT_KEY]: "baseline-operating",
        [WARM_CAPACITY_KEY]: "reduced",
      },
    },
    incidentState: "partial-safe-reduction-az-still-peak",
    values: {
      requestSuccessRate: 99.93,
      p99LatencyMs: 100,
      monthlyInfrastructureCostUsd: 41_500,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "reduced-partial-safe",
    },
    componentHealth: safeReducedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // WASTEFUL-BUT-SAFE BASELINE — floor never touched (still fully
  // intact at its most expensive setting), and nothing has been reduced
  // either. Safe, but the incident this scenario actually poses — pure
  // economic waste — has not been addressed at all.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "unreviewed-peak-posture-sustained",
    when: { triggerEquals: { highRiskWindowEnded: true, sustainedUnreviewed: true } },
    incidentState: "unreviewed-peak-posture-sustained",
    values: {
      requestSuccessRate: 99.95,
      p99LatencyMs: 90,
      monthlyInfrastructureCostUsd: 48_000,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "unreviewed-peak-posture",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "unreviewed-peak-posture-baseline",
    when: { triggerEquals: { highRiskWindowEnded: true } },
    incidentState: "unreviewed-peak-posture-baseline",
    values: {
      requestSuccessRate: 99.95,
      p99LatencyMs: 90,
      monthlyInfrastructureCostUsd: 48_000,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "unreviewed-peak-posture",
    },
    componentHealth: healthyHealth,
  },

  // ── Default/fallback: before the incident begins. ──────────────────
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99.95,
      p99LatencyMs: 90,
      monthlyInfrastructureCostUsd: 48_000,
      resilienceFloorStatus: "at-floor-or-above",
      cumulativeUnabsorbedFailoverDrillCount: 0,
      costPostureStatus: "unreviewed-peak-posture",
    },
    componentHealth: healthyHealth,
  },
];
