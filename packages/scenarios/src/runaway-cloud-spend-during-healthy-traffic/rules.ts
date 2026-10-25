import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  autoscaler: "healthy",
  "worker-fleet": "healthy",
  database: "healthy",
  "object-store": "healthy",
};

/**
 * Authored rule table for Runaway Cloud Spend During Healthy Traffic,
 * ordered most-specific-first (first-match-wins). NO node in this
 * architecture ever turns "degraded" or "critical" in ANY rule below —
 * every componentHealth map in this file is `healthyHealth`. That is
 * the entire point: this is a proactive cost-efficiency puzzle on an
 * already-healthy system, not an outage, and the architecture view must
 * never imply otherwise (phase6e2.md requirement 8).
 *
 * ROOT CAUSE (three independent leftover misconfigurations, each with a
 * real, distinct cost contribution — none of them is a central
 * "bottleneck" to find and scale):
 *   1. autoscalerTargetUtilizationPercent left at 30% (conservative) —
 *      scales out sooner and keeps more running than a 55% target would.
 *   2. minReplicaCount left at 40 (from an unrelated past traffic-spike
 *      incident) — a floor so high the fleet can never shrink below it
 *      regardless of target utilization.
 *   3. idleCapacityPolicy left at "keep-warm" plus warmPoolSize left at
 *      20 — pure idle spend that a quiet, steady traffic pattern never
 *      needs.
 * Each is independently fixable and independently contributes to
 * runningInstanceCount / cost — there is no single lever that fixes
 * everything, and there is no "find the bottleneck, scale it" mechanic
 * at all (phase6e2.md requirement 2).
 *
 * ── REQUIRED UNSAFE-MINIMUM-COST TRAP (phase6e2.md requirement 4) ────
 * minReplicaCount = 2 (below the authored safety floor of 6) OR
 * idleCapacityPolicy = "scale-to-floor-minus-two" (which breaches the
 * floor independently of whatever minReplicaCount is set to) drives
 * runningInstanceCount and cost down FURTHER than any safe rightsizing
 * path reaches, while every customer-facing metric (latency, error
 * rate, throughput) stays exactly as healthy as before — because
 * traffic is genuinely low and steady right now. redundancyHeadroomStatus
 * flips to "breached" and a real, growing historical count of seconds
 * spent breached accrues for as long as the breach is live — this is
 * what actually makes the path unsafe, not any live customer-facing
 * signal.
 *
 * ── TWO REAL ALTERNATE STRONG PATHS (phase6e2.md requirement 3) ──────
 * Path A ("gradual rightsizing"): lower the autoscaler target to 55%,
 * lower minReplicaCount to the safe floor (6), switch idleCapacityPolicy
 * to "scale-to-min" — reaches a low, safe running instance count purely
 * by correcting the autoscaler's own thresholds. Mechanism: fewer
 * triggers to scale out, a lower floor, and permission to drain to it.
 * Path B ("batch first, then shrink"): enable request batching
 * (adaptive or aggressive) BEFORE touching fleet size at all — this
 * raises effective per-instance throughput without changing a single
 * autoscaler threshold, which organically lets the (still-high-floor)
 * fleet's utilization rise and the Autoscaler itself decide to run
 * fewer instances; only once batching is live does reducing
 * minReplicaCount/warmPoolSize become the final, safe step. Mechanism:
 * raising useful work per instance, not retuning scaling thresholds.
 * Both reach the OPTIMAL tier via materially different mechanisms and
 * score differently on costEfficiency/operationalEfficiency depending
 * on how many distinct configuration changes each required.
 */
export const runawayCloudSpendDuringHealthyTrafficRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE MINIMUM-COST TRAPS — checked first, win regardless of every
  // other control and regardless of how healthy customer-facing
  // metrics look. Two independent ways to breach the floor.
  // ══════════════════════════════════════════════════════════════════

  // Compounded: both forbidden levers active at once. Cheapest raw cost
  // number in the entire scenario; worst historical breach accrual.
  {
    id: "floor-breached-compounded-sustained",
    when: {
      triggerEquals: { costAnomalyActive: true, sustainedOverspend: true },
      controlEquals: {
        [MIN_REPLICA_COUNT_KEY]: 2,
        [IDLE_CAPACITY_POLICY_KEY]: "scale-to-floor-minus-two",
      },
    },
    incidentState: "floor-breached-compounded-sustained",
    values: {
      requestLatencyP99Ms: 195,
      errorRatePercent: 0.15,
      requestsPerSecond: 420,
      runningInstanceCount: 2,
      workerUtilizationPercent: 62,
      databaseUtilizationPercent: 24,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.35,
      costPerRequestUsd: 0.00083,
      redundancyHeadroomStatus: "breached",
      cumulativeHeadroomBreachSeconds: 240,
      costSafetyStatus: "minimum-cost-unsafe",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "floor-breached-compounded",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: {
        [MIN_REPLICA_COUNT_KEY]: 2,
        [IDLE_CAPACITY_POLICY_KEY]: "scale-to-floor-minus-two",
      },
    },
    incidentState: "floor-breached-compounded",
    values: {
      requestLatencyP99Ms: 190,
      errorRatePercent: 0.12,
      requestsPerSecond: 420,
      runningInstanceCount: 2,
      workerUtilizationPercent: 58,
      databaseUtilizationPercent: 23,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.35,
      costPerRequestUsd: 0.00083,
      redundancyHeadroomStatus: "breached",
      cumulativeHeadroomBreachSeconds: 60,
      costSafetyStatus: "minimum-cost-unsafe",
    },
    componentHealth: healthyHealth,
  },

  // minReplicaCount alone below the floor.
  {
    id: "min-replica-floor-breached-sustained",
    when: {
      triggerEquals: { costAnomalyActive: true, sustainedOverspend: true },
      controlEquals: { [MIN_REPLICA_COUNT_KEY]: 2 },
    },
    incidentState: "min-replica-floor-breached-sustained",
    values: {
      requestLatencyP99Ms: 185,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 4,
      workerUtilizationPercent: 46,
      databaseUtilizationPercent: 23,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.5,
      costPerRequestUsd: 0.0012,
      redundancyHeadroomStatus: "breached",
      cumulativeHeadroomBreachSeconds: 240,
      costSafetyStatus: "minimum-cost-unsafe",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "min-replica-floor-breached",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: { [MIN_REPLICA_COUNT_KEY]: 2 },
    },
    incidentState: "min-replica-floor-breached",
    values: {
      requestLatencyP99Ms: 182,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 4,
      workerUtilizationPercent: 42,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.5,
      costPerRequestUsd: 0.0012,
      redundancyHeadroomStatus: "breached",
      cumulativeHeadroomBreachSeconds: 60,
      costSafetyStatus: "minimum-cost-unsafe",
    },
    componentHealth: healthyHealth,
  },

  // idleCapacityPolicy alone breaches the floor, independent of
  // whatever minReplicaCount is set to (even a SAFE floor of 6 is
  // bypassed by this policy's own "-2" behavior) — proves
  // idleCapacityPolicy is not a dead control and that there are two
  // independent ways to create the same unsafe condition.
  {
    id: "idle-policy-floor-breached-sustained",
    when: {
      triggerEquals: { costAnomalyActive: true, sustainedOverspend: true },
      controlEquals: { [IDLE_CAPACITY_POLICY_KEY]: "scale-to-floor-minus-two" },
    },
    incidentState: "idle-policy-floor-breached-sustained",
    values: {
      requestLatencyP99Ms: 188,
      errorRatePercent: 0.11,
      requestsPerSecond: 420,
      runningInstanceCount: 4,
      workerUtilizationPercent: 50,
      databaseUtilizationPercent: 23,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.55,
      costPerRequestUsd: 0.0013,
      redundancyHeadroomStatus: "breached",
      cumulativeHeadroomBreachSeconds: 240,
      costSafetyStatus: "minimum-cost-unsafe",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "idle-policy-floor-breached",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: { [IDLE_CAPACITY_POLICY_KEY]: "scale-to-floor-minus-two" },
    },
    incidentState: "idle-policy-floor-breached",
    values: {
      requestLatencyP99Ms: 186,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 4,
      workerUtilizationPercent: 47,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.55,
      costPerRequestUsd: 0.0013,
      redundancyHeadroomStatus: "breached",
      cumulativeHeadroomBreachSeconds: 60,
      costSafetyStatus: "minimum-cost-unsafe",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // AGGRESSIVE-UTILIZATION-WITHOUT-RIGHTSIZING TRAP — raising target
  // utilization to "aggressive" (80%) without also lowering the floor
  // or enabling batching does not relieve anything: the fleet is still
  // pinned by the high floor/keep-warm policy, so running instance
  // count barely moves, while per-instance headroom for absorbing a
  // normal bump is now thinner. Not a floor breach (nothing here sets
  // redundancyHeadroomStatus to "breached"), but a real, measurably
  // worse combination than leaving utilization at the safe "balanced"
  // target, proving aggressive-utilization alone is a trap, not a
  // shortcut.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "aggressive-utilization-without-rightsizing",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: {
        [AUTOSCALER_TARGET_UTILIZATION_KEY]: 80,
        [MIN_REPLICA_COUNT_KEY]: 40,
      },
    },
    incidentState: "aggressive-utilization-without-rightsizing",
    values: {
      requestLatencyP99Ms: 210,
      errorRatePercent: 0.12,
      requestsPerSecond: 420,
      runningInstanceCount: 40,
      workerUtilizationPercent: 21,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.4,
      costPerRequestUsd: 0.0057,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // WARM-POOL-REMOVED-BEFORE-RIGHTSIZING TRAP — dropping the warm pool
  // to zero removes its idle cost, but while the replica floor is
  // STILL the leftover 40, there was no cold-start exposure to remove
  // in the first place (40 standing instances already provide far more
  // cushion than any warm pool would add) — this change is pure,
  // premature risk-taking for a trivial cost benefit: it genuinely
  // removes the cold-start cushion (a real, if currently invisible,
  // protection) before any of the controls that actually determine
  // whether removing it is safe (the replica floor, idle-capacity
  // policy) have been addressed. Not a redundancy-floor breach (floor
  // itself is untouched, still safely high), but a real, distinct,
  // worse-than-baseline combination proving warmPoolSize independently
  // participates in this scenario's mechanics rather than being a
  // cost-only decoration.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "warm-pool-removed-before-rightsizing",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: { [WARM_POOL_SIZE_KEY]: 0, [MIN_REPLICA_COUNT_KEY]: 40 },
    },
    incidentState: "warm-pool-removed-before-rightsizing",
    values: {
      requestLatencyP99Ms: 184,
      errorRatePercent: 0.11,
      requestsPerSecond: 420,
      runningInstanceCount: 48,
      workerUtilizationPercent: 18,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.38,
      costPerRequestUsd: 0.0057,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ECONOMY-CLASS-WITHOUT-BATCHING TRAP — switching instance class
  // straight to "economy" without first enabling batching reduces
  // per-instance cost, but the class is genuinely undersized for this
  // workload's unbatched per-request compute profile: real, measurable
  // latency increase, large enough to eat most of the SLO margin
  // (business invariant #4 allows a SMALL latency increase within SLO —
  // this is deliberately close to the line, not comfortably inside it,
  // to make "economy alone" a real trap rather than a free win).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "economy-class-without-batching",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: {
        [WORKER_INSTANCE_CLASS_KEY]: "economy",
        [REQUEST_BATCHING_MODE_KEY]: "disabled",
      },
    },
    incidentState: "economy-class-without-batching",
    values: {
      requestLatencyP99Ms: 395,
      errorRatePercent: 0.2,
      requestsPerSecond: 420,
      runningInstanceCount: 48,
      workerUtilizationPercent: 34,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.1,
      costPerRequestUsd: 0.005,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE PATH B PROGRESSION — batching engaged FIRST, before any
  // fleet-shrinking control is touched. Raises effective per-instance
  // throughput; running instance count begins to fall purely because
  // the (still-high) floor and ceiling are no longer the constraint —
  // utilization itself rises.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "batching-engaged-utilization-rising",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: { [REQUEST_BATCHING_MODE_KEY]: "adaptive" },
    },
    incidentState: "batching-engaged-utilization-rising",
    values: {
      requestLatencyP99Ms: 175,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 40,
      workerUtilizationPercent: 24,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.2,
      costPerRequestUsd: 0.0052,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "rightsizing",
    },
    componentHealth: healthyHealth,
  },

  // Path B, aggressive batching + a real elapsed drain window + a safe
  // floor already lowered: OPTIMAL via the batching mechanism. Small,
  // real, within-SLO latency uptick from aggressive batching itself
  // (business invariant #4), far fewer instances than Path A needs to
  // reach the SAME safe floor because effective per-instance throughput
  // is genuinely higher.
  {
    id: "path-b-optimal-batched-and-drained",
    when: {
      triggerEquals: { costAnomalyActive: true, rightsizingFullyDrainedElapsed: true },
      controlEquals: {
        [REQUEST_BATCHING_MODE_KEY]: "aggressive",
        [MIN_REPLICA_COUNT_KEY]: 6,
      },
    },
    incidentState: "path-b-optimal-batched-and-drained",
    values: {
      requestLatencyP99Ms: 240,
      errorRatePercent: 0.11,
      requestsPerSecond: 420,
      runningInstanceCount: 7,
      workerUtilizationPercent: 56,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.62,
      costPerRequestUsd: 0.0015,
      redundancyHeadroomStatus: "protected",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "efficient-safe",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE PATH A PROGRESSION — gradual rightsizing via the
  // Autoscaler's own thresholds (target utilization + floor +
  // scale-to-min), no batching touched at all. Requires BOTH a safe
  // floor (6) and a real elapsed drain window — never instant.
  // ══════════════════════════════════════════════════════════════════

  // Just engaged, no elapsed drain window yet (tick-zero proof that
  // rightsizing does not instantly shrink the fleet).
  {
    id: "path-a-rightsizing-just-engaged",
    when: {
      triggerEquals: { costAnomalyActive: true, rightsizingWindow1Elapsed: false },
      controlEquals: {
        [AUTOSCALER_TARGET_UTILIZATION_KEY]: 55,
        [MIN_REPLICA_COUNT_KEY]: 6,
        [IDLE_CAPACITY_POLICY_KEY]: "scale-to-min",
      },
    },
    incidentState: "path-a-rightsizing-just-engaged",
    values: {
      requestLatencyP99Ms: 182,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 40,
      workerUtilizationPercent: 22,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.2,
      costPerRequestUsd: 0.0052,
      redundancyHeadroomStatus: "protected",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "rightsizing",
    },
    componentHealth: healthyHealth,
  },

  // Draining, window 1 — real, partial progress below the leftover-48
  // ceiling, still well above the eventual safe target.
  {
    id: "path-a-rightsizing-draining-window1",
    when: {
      triggerEquals: {
        costAnomalyActive: true,
        rightsizingWindow1Elapsed: true,
        rightsizingWindow2Elapsed: false,
      },
      controlEquals: {
        [AUTOSCALER_TARGET_UTILIZATION_KEY]: 55,
        [MIN_REPLICA_COUNT_KEY]: 6,
        [IDLE_CAPACITY_POLICY_KEY]: "scale-to-min",
      },
    },
    incidentState: "path-a-rightsizing-draining-window1",
    values: {
      requestLatencyP99Ms: 185,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 24,
      workerUtilizationPercent: 35,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 1.4,
      costPerRequestUsd: 0.0033,
      redundancyHeadroomStatus: "protected",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "rightsizing",
    },
    componentHealth: healthyHealth,
  },

  // Draining, window 2 — further progress than window 1.
  {
    id: "path-a-rightsizing-draining-window2",
    when: {
      triggerEquals: {
        costAnomalyActive: true,
        rightsizingWindow2Elapsed: true,
        rightsizingFullyDrainedElapsed: false,
      },
      controlEquals: {
        [AUTOSCALER_TARGET_UTILIZATION_KEY]: 55,
        [MIN_REPLICA_COUNT_KEY]: 6,
        [IDLE_CAPACITY_POLICY_KEY]: "scale-to-min",
      },
    },
    incidentState: "path-a-rightsizing-draining-window2",
    values: {
      requestLatencyP99Ms: 186,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 12,
      workerUtilizationPercent: 48,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.85,
      costPerRequestUsd: 0.002,
      redundancyHeadroomStatus: "protected",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "rightsizing",
    },
    componentHealth: healthyHealth,
  },

  // Fully drained — OPTIMAL via Path A's mechanism: correcting the
  // Autoscaler's own thresholds, no batching involved at all.
  {
    id: "path-a-optimal-fully-drained",
    when: {
      triggerEquals: { costAnomalyActive: true, rightsizingFullyDrainedElapsed: true },
      controlEquals: {
        [AUTOSCALER_TARGET_UTILIZATION_KEY]: 55,
        [MIN_REPLICA_COUNT_KEY]: 6,
        [IDLE_CAPACITY_POLICY_KEY]: "scale-to-min",
      },
    },
    incidentState: "path-a-optimal-fully-drained",
    values: {
      requestLatencyP99Ms: 188,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 7,
      workerUtilizationPercent: 54,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 0.6,
      costPerRequestUsd: 0.0014,
      redundancyHeadroomStatus: "protected",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "efficient-safe",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PARTIAL / INCOMPLETE SAFE PROGRESS — only the floor was lowered,
  // target utilization and idle policy left untouched: a real, safe,
  // but incomplete improvement. Demonstrates each lever's independent
  // contribution (requirement: every control must participate in real
  // mechanic, none decorative).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "floor-lowered-alone-partial",
    when: {
      triggerEquals: { costAnomalyActive: true },
      controlEquals: { [MIN_REPLICA_COUNT_KEY]: 6 },
    },
    incidentState: "floor-lowered-alone-partial",
    values: {
      requestLatencyP99Ms: 183,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 40,
      workerUtilizationPercent: 18,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.2,
      costPerRequestUsd: 0.0052,
      redundancyHeadroomStatus: "protected",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — nothing engaged. All three leftover misconfigurations
  // still active; cost stays high, customer metrics stay green.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "cost-anomaly-sustained",
    when: { triggerEquals: { costAnomalyActive: true, sustainedOverspend: true } },
    incidentState: "cost-anomaly-sustained",
    values: {
      requestLatencyP99Ms: 180,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 48,
      workerUtilizationPercent: 18,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.6,
      costPerRequestUsd: 0.0062,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "cost-anomaly-baseline",
    when: { triggerEquals: { costAnomalyActive: true } },
    incidentState: "cost-anomaly-baseline",
    values: {
      requestLatencyP99Ms: 180,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 48,
      workerUtilizationPercent: 18,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.6,
      costPerRequestUsd: 0.0062,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },

  // ── Default/fallback: before the incident begins. ──────────────────
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestLatencyP99Ms: 180,
      errorRatePercent: 0.1,
      requestsPerSecond: 420,
      runningInstanceCount: 48,
      workerUtilizationPercent: 18,
      databaseUtilizationPercent: 22,
      objectStoreEgressGbPerHour: 40,
      costPerMinuteUsd: 2.6,
      costPerRequestUsd: 0.0062,
      redundancyHeadroomStatus: "oversized",
      cumulativeHeadroomBreachSeconds: 0,
      costSafetyStatus: "unaddressed",
    },
    componentHealth: healthyHealth,
  },
];
