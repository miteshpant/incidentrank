import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  CONTINGENCY_RESERVE_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./controls";

/**
 * Revenue loss here models real, live Critical-Tier business loss once
 * the event has actually arrived — never a cost incurred merely by
 * deciding slowly during the pre-event decision window (every
 * "decision-window-open"/"healthy"/"deadline-missed-no-exposure-yet"
 * state is 0; no real exposure exists until the event itself starts).
 * A "breached" state loses real money at a rate proportional to how far
 * short of the critical band the reservation decision actually is;
 * "at-risk"/"concentrated-but-undisrupted" states lose a small amount
 * (the real, if modest, business risk of thin headroom); every
 * genuinely protected state loses nothing.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "decision-window-open": 0,
  "deadline-missed-no-exposure-yet": 0,
  "deadline-missed-event-arrived": 320,
  "deadline-missed-event-sustained": 420,
  "baseline-breached-arrived": 340,
  "min-breached-arrived": 260,
  "min-breached-sustained": 300,
  "thin-mismatch-breached-sustained": 180,
  "conc-disrupted": 260,
  "mid-disrupted-no-fallback": 140,
  "thin-at-risk-arrived": 20,
  "conc-arrived": 15,
  "conc-undisrupted-sustained": 25,
  "mid-acceptable-sustained-undeclared": 10,
  "thin-rescued-by-fallback-sustained": 0,
  "mid-disrupted-fallback-enabled": 0,
  "high-disrupted": 0,
  "high-optimal-arrived": 0,
  "mid-optimal-arrived": 0,
  "high-optimal-sustained": 0,
  "mid-optimal-sustained-full": 0,
  "mid-optimal-sustained-fallback-only": 0,
  "high-waste-sustained": 0,
  "high-waste-arrived": 0,
};

/**
 * Baseline cost represents the cost of reserving NOTHING (the
 * pre-decision default) — every real reservation/contingency choice is
 * priced as a genuine ADD on top of that baseline (never a reduction
 * from an already-inflated starting number), so costIncreaseRatio
 * (peak vs. this baseline) honestly discriminates between the
 * scenario's two safe economic profiles: Path A's high, broad
 * reservation costs materially more than Path B's moderate reservation
 * + bounded on-demand fallback, and the required "maximal reservation,
 * no regard for waste" trap costs the most of any genuinely safe-on-
 * headroom state. onDemandFallbackPolicy itself carries a small
 * standing readiness fee (a provider's burst-capacity commitment is not
 * free to keep available, even before it is ever drawn on) — distinct
 * from onDemandExposureUnits' own per-unit usage premium, which is
 * folded into revenueLossRatePerMinute's breached/at-risk states above
 * rather than modeled as a separate infrastructure line.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 600,
  perUnitMonthlyUsd: {
    [`${RESERVED_CAPACITY_REGION_A_KEY}:0`]: 0,
    [`${RESERVED_CAPACITY_REGION_A_KEY}:300`]: 900,
    [`${RESERVED_CAPACITY_REGION_A_KEY}:600`]: 1_800,
    [`${RESERVED_CAPACITY_REGION_A_KEY}:900`]: 2_700,
    [`${RESERVED_CAPACITY_REGION_B_KEY}:0`]: 0,
    [`${RESERVED_CAPACITY_REGION_B_KEY}:300`]: 900,
    [`${RESERVED_CAPACITY_REGION_B_KEY}:600`]: 1_800,
    [`${RESERVED_CAPACITY_REGION_B_KEY}:900`]: 2_700,
    [`${RESERVED_CAPACITY_REGION_C_KEY}:0`]: 0,
    [`${RESERVED_CAPACITY_REGION_C_KEY}:300`]: 900,
    [`${RESERVED_CAPACITY_REGION_C_KEY}:600`]: 1_800,
    [`${RESERVED_CAPACITY_REGION_C_KEY}:900`]: 2_700,
    [`${ON_DEMAND_FALLBACK_POLICY_KEY}:enabled`]: 120,
    [`${CONTINGENCY_RESERVE_KEY}:small`]: 450,
    [`${CONTINGENCY_RESERVE_KEY}:large`]: 1_350,
  },
};

/**
 * successCondition (OPTIMAL): Critical-Tier workload genuinely
 * protected, no hidden regional concentration, no deliberate waste, and
 * the reservation was actually locked in before the deadline — every
 * one of the four real judgment axes (headroom, distribution, cost
 * discipline, timeliness) satisfied at once. Reachable via EITHER
 * Alternate Strong Path (HIGH alone, or MID + fallback + shedding) once
 * the event has genuinely arrived — see rules.ts's high-optimal-* and
 * mid-optimal-* families.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "criticalWorkloadProtectionStatus", operator: "equals", comparedTo: "protected" },
    { key: "regionalConcentrationStatus", operator: "equals", comparedTo: "balanced" },
    { key: "reservationWasteStatus", operator: "equals", comparedTo: "efficient" },
    { key: "reservationDecisionStatus", operator: "equals", comparedTo: "locked-in-on-time" },
  ],
  sustainedSeconds: 20,
};

/**
 * acceptableCondition (ACCEPTABLE): the legitimate degraded-but-safe
 * tier — Critical-Tier workload has thin but nonzero headroom
 * ("at-risk", never "breached"), distribution is genuinely balanced
 * (no hidden concentration risk), and the decision was locked in on
 * time. This is a real, operationally defensible handback: nothing is
 * currently failing, even though the margin is thinner than either
 * fully-optimal path would have provided. Deliberately does NOT accept
 * "protected" + "wasteful" (the maximal-reservation trap) as
 * acceptable — see this scenario's Score Integrity / Option D
 * investigation in the completion report for why that combination is
 * scored as a real, distinct outcome rather than silently folded into
 * either tier.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "criticalWorkloadProtectionStatus", operator: "equals", comparedTo: "at-risk" },
    { key: "regionalConcentrationStatus", operator: "equals", comparedTo: "balanced" },
    { key: "reservationDecisionStatus", operator: "equals", comparedTo: "locked-in-on-time" },
  ],
  sustainedSeconds: 20,
};

/**
 * Failure: a genuine, sustained Critical-Tier shortfall has run long
 * enough, at a severe enough cumulative exposure, to constitute a
 * catastrophic business loss within this attempt — gated on the
 * cumulative deadline-miss exposure counter (a real, counted measure of
 * how long the reservation was never actually committed while the event
 * was live), so a brief, quickly-corrected miss is not instantly fatal
 * but a sustained, unaddressed one is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "cumulativeDeadlineMissExposureUnits", operator: "greater_than_or_equal", comparedTo: 1_200 }],
  sustainedSeconds: 30,
};
