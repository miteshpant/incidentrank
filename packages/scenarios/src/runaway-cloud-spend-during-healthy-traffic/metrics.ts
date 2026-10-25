import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Customer-facing health (ALL healthy from tick zero — there is NO
  // outage and NO traffic spike in this scenario; a candidate who only
  // watches these never sees anything wrong, which is correct — the
  // problem is economic, not availability) ───────────────────────────
  requestLatencyP99Ms: 180,
  errorRatePercent: 0.1,
  requestsPerSecond: 420,

  // ── Worker Fleet shape — the real cost surface ──────────────────────
  // Instances actually running right now. Starts pinned high by the
  // conservative target utilization + high floor + keep-warm policy —
  // all three independently inflate this number even though traffic is
  // healthy and steady.
  runningInstanceCount: 48,
  // Average CPU utilization per running instance. Low (healthy
  // headroom), but FAR lower than the authored-safe 55% target — proof
  // the fleet is oversized for current load, not merely "has headroom."
  workerUtilizationPercent: 18,

  // ── Database / storage (never the bottleneck in this scenario — a
  // decoy-healthy signal, same technique as Identity Platform
  // Degradation's Token Verification) ──────────────────────────────────
  databaseUtilizationPercent: 22,
  objectStoreEgressGbPerHour: 40,

  // ── Cost ─────────────────────────────────────────────────────────────
  costPerMinuteUsd: 2.6,
  costPerRequestUsd: 0.0062,

  // ── Redundancy headroom (business invariant #2's authored field) ────
  // Reachable string values:
  //   "protected"  — minReplicaCount is at/above the safety floor (6)
  //                   AND idleCapacityPolicy is not breaching it either.
  //                   Genuinely safe, whatever the exact replica count.
  //   "oversized"  — protected, but with far more standing capacity
  //                   than the safety floor requires (the starting
  //                   leftover-config state).
  //   "breached"   — minReplicaCount itself has been set below the
  //                   safety floor, OR idleCapacityPolicy is draining
  //                   below the floor regardless of minReplicaCount —
  //                   either way, redundancy is no longer genuinely
  //                   protected, even though nothing customer-facing
  //                   currently shows it.
  redundancyHeadroomStatus: "oversized",

  // ── HISTORICAL / CUMULATIVE damage (this scenario's required
  // non-resetting field, phase6e2.md). Counts real ticks spent with
  // redundancyHeadroomStatus === "breached". Only ever increases while
  // the floor is breached; never reset by restoring the floor
  // afterward — see rules.ts and definition.ts's completion-mode audit
  // for the explicit non-reset proof via numericWatchFields'
  // trackPeak. ───────────────────────────────────────────────────────
  cumulativeHeadroomBreachSeconds: 0,

  // Generic summary string read by successCondition/acceptableCondition
  // and by scoring's dataIntegrity-as-safety-gate measure — the single
  // authoritative answer to "is this spend level actually safe to hand
  // back right now."
  //   "unaddressed"      — incident active, cost still inflated, no
  //                        rightsizing lever engaged yet.
  //   "rightsizing"       — a real relief lever is engaged but not yet
  //                        fully reflected (recovery-lag window).
  //   "efficient-safe"    — cost has been materially reduced AND the
  //                        redundancy floor is genuinely protected.
  //   "minimum-cost-unsafe" — cost looks excellent, but the redundancy
  //                        floor has been breached to get there.
  costSafetyStatus: "unaddressed",
};
