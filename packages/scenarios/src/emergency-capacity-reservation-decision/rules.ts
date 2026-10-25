import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONTINGENCY_RESERVE_KEY,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "demand-forecasting": "healthy",
  "capacity-planner": "healthy",
  "region-a": "healthy",
  "region-b": "healthy",
  "region-c": "healthy",
  "reserved-capacity": "healthy",
  "on-demand-capacity": "healthy",
};

const regionAStressedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "region-a": "critical",
  "reserved-capacity": "degraded",
};

const breachedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "reserved-capacity": "critical",
  "on-demand-capacity": "critical",
};

const atRiskHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "reserved-capacity": "degraded",
};

/**
 * Authored rule table for Emergency Capacity Reservation Decision,
 * ordered most-specific-first (first-match-wins, top-to-bottom).
 *
 * ROOT SITUATION: a PROACTIVE, pre-event decision — nothing is broken at
 * incident start. demandForecastP50/P90/P99Units are static for the
 * whole attempt (the forecast itself never changes; only the candidate's
 * reservation decision does). The candidate commits reserved capacity
 * per region (RESERVED_CAPACITY_REGION_A/B/C_KEY, in abstract capacity
 * units) before RESERVATION_DEADLINE_MS, and the real test only arrives
 * once EVENT_ARRIVAL_MS / EVENT_SUSTAINED_MS fire (timed-events.ts).
 *
 * DEMAND MODEL (authored, not computed): Critical-Tier demand ramps to
 * the p90 band (1,000 units) at EVENT_ARRIVAL_MS and to the full p99 tail
 * band (1,400 units) at EVENT_SUSTAINED_MS — a real, two-stage escalation
 * so a reservation level that looks adequate against a strong-but-not-
 * worst-case arrival can still fail once the genuine tail materializes.
 * onDemandFallbackPolicy="enabled" is a bounded safety valve: it can
 * rescue a shortfall of up to 200 units beyond the reserved total, never
 * an unlimited one — this is what keeps the unsafe MIN/CONC strategies
 * genuinely unsafe even with fallback engaged (their shortfalls exceed
 * the bound), while making Path B's fallback a real, load-bearing
 * mechanism for its own, smaller shortfalls rather than a free pass.
 *
 * NAMED RESERVATION STRATEGIES (exact region triples this table
 * enumerates explicitly, in abstract capacity units):
 *   BASELINE (0, 0, 0)       total 0     — no decision at all.
 *   MIN      (300, 300, 300) total 900   — cheapest reservation; violates
 *                                           critical headroom outright.
 *   CONC     (900, 300, 300) total 1,500 — looks adequate in aggregate
 *                                           (comfortably above the full
 *                                           p99 critical band) but 60% of
 *                                           it sits in Region A alone —
 *                                           the required hidden-
 *                                           concentration-risk trap.
 *   THIN     (300, 300, 600) total 1,200 — adequate against the arrival-
 *                                           level band, thin against the
 *                                           full tail — the forecast-
 *                                           confidence-mismatch trap when
 *                                           paired with leaving
 *                                           forecastConfidenceThreshold
 *                                           at its default "p50-only".
 *   MID      (600, 600, 600) total 1,800 — Alternate Strong Path B's
 *                                           anchor: covers the full p99
 *                                           critical band on reserved
 *                                           capacity alone, with fallback
 *                                           +shedding as the real,
 *                                           load-bearing margin once
 *                                           Region A is disrupted.
 *   HIGH     (900, 900, 900) total 2,700 — Alternate Strong Path A's
 *                                           anchor: comfortably exceeds
 *                                           the full p99 band on reserved
 *                                           capacity alone; never needs
 *                                           fallback/shedding at all.
 *   HIGH + contingencyReservePercent="large" → effective total 3,150 —
 *     the required "maximal reservation, no regard for waste" trap:
 *     technically safe on headroom, genuinely poor on cost.
 *
 * REGIONAL DISRUPTION (timed-events.ts's REGIONAL_DISRUPTION_MS):
 * Region A loses its entire reserved share for the rest of the event,
 * independent of any candidate choice. CONC loses 900 of its 1,500
 * (leaving 600 — far below even the bounded-fallback-rescued floor) and
 * breaches regardless of fallback; MID loses 600 of its 1,800 (leaving
 * 1,200 from B+C — exactly 200 short of the 1,400 critical tail, i.e.
 * exactly within the fallback bound) and is rescued ONLY if
 * onDemandFallbackPolicy is "enabled"; HIGH loses 900 of its 2,700
 * (leaving 1,800 from B+C alone) and stays protected regardless. This is
 * the mechanism that makes concentration a genuinely distinct, more
 * severe trap than simple thinness — no bounded fallback can rescue it.
 *
 * DEADLINE-MISSED TRAP: if reservationTiming is still "wait" (the
 * untouched default) once reservationDeadlinePassed fires, the decision
 * is recorded as missed and reservedCapacityTotalUnits reads 0 for as
 * long as that persists — whatever the region dials are set to is
 * irrelevant while timing stays "wait", because nothing is actually
 * committed until the candidate takes the lock-in action. Checked ABOVE
 * every named-strategy rule below, since it overrides all of them while
 * timing stays "wait" past the deadline. Honest engine-level limitation
 * (shared with every other built-in deadline scenario in this codebase,
 * e.g. Certificate Expiry Across Large Fleet's expiry-deadline-missed
 * family): rules match against the CURRENT control value each tick, not
 * a historical record of when it changed — so a candidate who locks in
 * LATE (after the deadline has already passed) does genuinely recover
 * from that point forward once reservationTiming flips to
 * "lock-in-now". What makes the miss window a real, permanent
 * consequence rather than a costless do-over is
 * cumulativeDeadlineMissExposureUnits (metrics.ts): a trackPeak-tracked
 * counter that only ever grows while reservationTiming sits at "wait"
 * past the deadline with the event live, and — like every other
 * historical-damage field in this codebase — never resets once the
 * candidate eventually locks in, proving the exposure window was real
 * even though the live state can still recover afterward.
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing here scales one service and
 * overloads a downstream dependency — every lever is a reservation
 * amount, a fallback/shedding policy, a forecast-confidence choice, or a
 * timing decision. This is a PROACTIVE capacity-allocation decision
 * under forecast uncertainty, never a reactive diagnosis of an existing
 * overload (see this scenario's duplicate-mechanism audit).
 */
export const emergencyCapacityReservationDecisionRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // DEADLINE-MISSED TRAP — checked first: overrides every region dial
  // setting the instant the deadline has passed with reservationTiming
  // never flipped to "lock-in-now".
  // ══════════════════════════════════════════════════════════════════
  {
    id: "deadline-missed-event-sustained",
    when: {
      triggerEquals: { reservationDeadlinePassed: true, eventSustained: true },
      controlEquals: { [RESERVATION_TIMING_KEY]: "wait" },
    },
    incidentState: "deadline-missed-event-sustained",
    values: {
      reservedCapacityTotalUnits: 0,
      onDemandExposureUnits: 1_400,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 1200,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "deadline-missed",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: breachedHealth,
  },
  {
    id: "deadline-missed-event-arrived",
    when: {
      triggerEquals: { reservationDeadlinePassed: true, eventArrived: true },
      controlEquals: { [RESERVATION_TIMING_KEY]: "wait" },
    },
    incidentState: "deadline-missed-event-arrived",
    values: {
      reservedCapacityTotalUnits: 0,
      onDemandExposureUnits: 1_000,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 500,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "deadline-missed",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: breachedHealth,
  },
  {
    id: "deadline-missed-no-exposure-yet",
    when: {
      triggerEquals: { reservationDeadlinePassed: true },
      controlEquals: { [RESERVATION_TIMING_KEY]: "wait" },
    },
    incidentState: "deadline-missed-no-exposure-yet",
    values: {
      reservedCapacityTotalUnits: 0,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "not-yet-exposed",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "deadline-missed",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: atRiskHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // REGIONAL DISRUPTION ACTIVE — Region A's reserved share is gone for
  // the rest of the event. Checked before the undisrupted named-
  // strategy rules below (more specific trigger set).
  // ══════════════════════════════════════════════════════════════════

  // CONC disrupted: 900 of 1,500 lost. No bounded fallback (+200) can
  // rescue a 900-unit loss against a 1,400-unit critical band — the
  // concentration trap holds regardless of fallback/shedding.
  {
    id: "conc-disrupted",
    when: {
      triggerEquals: { regionADisrupted: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 300,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "conc-disrupted",
    values: {
      reservedCapacityTotalUnits: 600,
      onDemandExposureUnits: 800,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "concentrated",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: regionAStressedHealth,
  },

  // MID disrupted + fallback enabled: 600 of 1,800 lost, leaving 1,200
  // from B+C — exactly 200 short of the 1,400 critical tail, exactly
  // within the bounded fallback's rescue capacity. Proves fallback is
  // genuinely load-bearing for Path B, not cosmetic.
  {
    id: "mid-disrupted-fallback-enabled",
    when: {
      triggerEquals: { regionADisrupted: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 600,
        [RESERVED_CAPACITY_REGION_B_KEY]: 600,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "enabled",
      },
    },
    incidentState: "mid-disrupted-fallback-enabled",
    values: {
      reservedCapacityTotalUnits: 1_200,
      onDemandExposureUnits: 200,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: regionAStressedHealth,
  },

  // MID disrupted, fallback left at its untouched default "disabled":
  // the same 1,200-unit remainder, but with no safety valve — a real,
  // genuine breach. Proves the fallback-enabled rule above is not
  // vacuous (disruption alone does not imply rescue).
  {
    id: "mid-disrupted-no-fallback",
    when: {
      triggerEquals: { regionADisrupted: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 600,
        [RESERVED_CAPACITY_REGION_B_KEY]: 600,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "disabled",
      },
    },
    incidentState: "mid-disrupted-no-fallback",
    values: {
      reservedCapacityTotalUnits: 1_200,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: regionAStressedHealth,
  },

  // HIGH disrupted: 900 of 2,700 lost, leaving 1,800 from B+C alone —
  // still comfortably above the 1,400 critical tail. Stays protected
  // regardless of fallback/shedding, proving Path A's margin genuinely
  // absorbs losing an entire region's share.
  {
    id: "high-disrupted",
    when: {
      triggerEquals: { regionADisrupted: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 900,
        [RESERVED_CAPACITY_REGION_C_KEY]: 900,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "high-disrupted",
    values: {
      reservedCapacityTotalUnits: 1_800,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: regionAStressedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNDISRUPTED, EVENT SUSTAINED (full p99 tail band, 1,400 critical
  // units) — the named strategies' steady-state outcomes once the worst
  // case has fully materialized.
  // ══════════════════════════════════════════════════════════════════

  // HIGH + contingencyReservePercent="large" — the required maximal-
  // reservation-no-regard-for-waste trap: protected on headroom, but a
  // real, named cost failure (reservationWasteStatus="wasteful").
  {
    id: "high-waste-sustained",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 900,
        [RESERVED_CAPACITY_REGION_C_KEY]: 900,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [CONTINGENCY_RESERVE_KEY]: "large",
      },
    },
    incidentState: "high-waste-sustained",
    values: {
      reservedCapacityTotalUnits: 3_150,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 1_750,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "wasteful",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // HIGH — Alternate Strong Path A, OPTIMAL. fallback/shedding/
  // forecastConfidenceThreshold/contingencyReservePercent are all left
  // at their untouched defaults here (this rule's controlEquals
  // deliberately does not constrain any of them) — Path A's own
  // description never asks the candidate to touch those levers, and
  // without this unconstrained match, a candidate who used exactly this
  // strategy would fall through to a rule that wrongly requires them to
  // be touched. This is the batch's binding default-value completeness
  // requirement, applied directly.
  {
    id: "high-optimal-sustained",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 900,
        [RESERVED_CAPACITY_REGION_C_KEY]: 900,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "high-optimal-sustained",
    values: {
      reservedCapacityTotalUnits: 2_700,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // MID + fallback enabled + shedding engaged — Alternate Strong Path B,
  // OPTIMAL, the fully deliberate variant.
  {
    id: "mid-optimal-sustained-full",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 600,
        [RESERVED_CAPACITY_REGION_B_KEY]: 600,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "enabled",
        [OPTIONAL_WORKLOAD_SHEDDING_KEY]: "shed-under-pressure",
      },
    },
    incidentState: "mid-optimal-sustained-full",
    values: {
      reservedCapacityTotalUnits: 1_800,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // MID + fallback enabled, optionalWorkloadShedding left at its
  // untouched default "none" — fallback alone still rescues MID's small
  // optional-tier overflow (reserved capacity already covers the full
  // critical band on its own), so this reaches the same genuinely safe
  // OPTIMAL outcome. Covered explicitly for the identical default-value
  // completeness reason as high-optimal-sustained above — a candidate
  // who engaged fallback but never touched shedding must not fall
  // through to a less-specific or unsafe rule.
  {
    id: "mid-optimal-sustained-fallback-only",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 600,
        [RESERVED_CAPACITY_REGION_B_KEY]: 600,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "enabled",
        [OPTIONAL_WORKLOAD_SHEDDING_KEY]: "none",
      },
    },
    incidentState: "mid-optimal-sustained-fallback-only",
    values: {
      reservedCapacityTotalUnits: 1_800,
      onDemandExposureUnits: 100,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // MID with fallback/shedding both left at their untouched defaults —
  // critical is still protected on reserved capacity alone (1,800 >
  // 1,400), but the small optional-tier overflow was never a deliberate
  // policy choice (it just happens to not breach critical) — a real,
  // honest completeness gap distinct from the fully deliberate Path B
  // variants above. ACCEPTABLE, not OPTIMAL. Covered explicitly for the
  // same default-value completeness reason — a candidate who reserved
  // MID's exact total but touched neither safety-net control must still
  // land in a named, genuinely safe state, never fall through.
  {
    id: "mid-acceptable-sustained-undeclared",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 600,
        [RESERVED_CAPACITY_REGION_B_KEY]: 600,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "disabled",
        [OPTIONAL_WORKLOAD_SHEDDING_KEY]: "none",
      },
    },
    incidentState: "mid-acceptable-sustained-undeclared",
    values: {
      reservedCapacityTotalUnits: 1_800,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "at-risk",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: atRiskHealth,
  },

  // CONC, undisrupted-but-sustained — looks entirely fine right up until
  // Region A is disrupted (see conc-disrupted above): aggregate total
  // (1,500) exceeds the full 1,400 critical tail on paper.
  // regionalConcentrationStatus already reads "concentrated" even here
  // (the hidden risk exists the moment the decision is made, not only
  // once it is realized) — this is what lets the candidate-facing UI
  // surface the risk before it is ever actually triggered.
  {
    id: "conc-undisrupted-sustained",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 300,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "conc-undisrupted-sustained",
    values: {
      reservedCapacityTotalUnits: 1_500,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "concentrated",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: atRiskHealth,
  },

  // THIN, sustained + forecastConfidenceThreshold left at its untouched
  // default "p50-only": the full p99 tail (1,400) now exceeds THIN's
  // 1,200 total by 200, and no fallback/shedding was engaged — the
  // forecast-confidence-mismatch trap. The candidate never explicitly
  // acknowledged planning for anything beyond the median, and the gap
  // this creates is exactly the tail the median never covers.
  {
    id: "thin-mismatch-breached-sustained",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 300,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [FORECAST_CONFIDENCE_THRESHOLD_KEY]: "p50-only",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "disabled",
      },
    },
    incidentState: "thin-mismatch-breached-sustained",
    values: {
      reservedCapacityTotalUnits: 1_200,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: breachedHealth,
  },

  // THIN, sustained, fallback enabled this time: the same 200-unit gap
  // sits exactly within the bounded fallback's rescue capacity —
  // protected, but via a real on-demand premium rather than cleanly on
  // reserved capacity alone.
  {
    id: "thin-rescued-by-fallback-sustained",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 300,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [ON_DEMAND_FALLBACK_POLICY_KEY]: "enabled",
      },
    },
    incidentState: "thin-rescued-by-fallback-sustained",
    values: {
      reservedCapacityTotalUnits: 1_200,
      onDemandExposureUnits: 200,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: atRiskHealth,
  },

  // MIN, sustained — the cheapest reservation; violates critical
  // headroom outright, far beyond what the bounded fallback can rescue
  // (900 total vs. a 1,400 critical tail, a 500-unit gap).
  {
    id: "min-breached-sustained",
    when: {
      triggerEquals: { eventSustained: true },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 300,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 300,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "min-breached-sustained",
    values: {
      reservedCapacityTotalUnits: 900,
      onDemandExposureUnits: 200,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: breachedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // EVENT ARRIVED (p90-level demand, 1,000 critical units), not yet
  // sustained to the full tail — the arrival-stage outcomes for the
  // same named strategies.
  // ══════════════════════════════════════════════════════════════════

  // HIGH + contingencyReservePercent="large", arrival tier — the
  // arrival-tier counterpart of high-waste-sustained above, mirroring the
  // same sustained/arrived pairing pattern used for every other named
  // strategy in this file (high-optimal-*, mid-optimal-*, conc-*, thin-*,
  // min-breached-*). Without this rule, a candidate who engages the
  // maximal-reservation-no-regard-for-waste trap and calls Finish any
  // time in the ~100-second arrival-only window (after the 20s
  // successCondition dwell but before EVENT_SUSTAINED_MS) falls through
  // to high-optimal-arrived below, which — like high-optimal-sustained —
  // deliberately does not constrain contingencyReservePercent (by design,
  // for Path A candidates who never touch that lever). Positioned BEFORE
  // high-optimal-arrived: more specific (constrains one more control)
  // first, consistent with this file's first-match-wins discipline and
  // with high-waste-sustained's own position ahead of
  // high-optimal-sustained in the sustained-tier block above.
  {
    id: "high-waste-arrived",
    when: {
      triggerEquals: { eventArrived: true, eventSustained: false },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 900,
        [RESERVED_CAPACITY_REGION_C_KEY]: 900,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
        [CONTINGENCY_RESERVE_KEY]: "large",
      },
    },
    incidentState: "high-waste-arrived",
    values: {
      reservedCapacityTotalUnits: 3_150,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 1_750,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "wasteful",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "high-optimal-arrived",
    when: {
      triggerEquals: { eventArrived: true, eventSustained: false },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 900,
        [RESERVED_CAPACITY_REGION_C_KEY]: 900,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "high-optimal-arrived",
    values: {
      reservedCapacityTotalUnits: 2_700,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "mid-optimal-arrived",
    when: {
      triggerEquals: { eventArrived: true, eventSustained: false },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 600,
        [RESERVED_CAPACITY_REGION_B_KEY]: 600,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "mid-optimal-arrived",
    values: {
      reservedCapacityTotalUnits: 1_800,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "conc-arrived",
    when: {
      triggerEquals: { eventArrived: true, eventSustained: false },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 900,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 300,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "conc-arrived",
    values: {
      reservedCapacityTotalUnits: 1_500,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "protected",
      regionalConcentrationStatus: "concentrated",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: atRiskHealth,
  },
  {
    id: "thin-at-risk-arrived",
    when: {
      triggerEquals: { eventArrived: true, eventSustained: false },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 300,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 600,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "thin-at-risk-arrived",
    values: {
      reservedCapacityTotalUnits: 1_200,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "at-risk",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "warning",
    },
    componentHealth: atRiskHealth,
  },

  // MIN / BASELINE both breach immediately on arrival — the arrival-
  // level critical demand (1,000) already exceeds MIN's 900 total and
  // BASELINE's 0 total alike. A single rule covers both: no region
  // combination below 1,000 total survives arrival.
  {
    id: "min-breached-arrived",
    when: {
      triggerEquals: { eventArrived: true, eventSustained: false },
      controlEquals: {
        [RESERVED_CAPACITY_REGION_A_KEY]: 300,
        [RESERVED_CAPACITY_REGION_B_KEY]: 300,
        [RESERVED_CAPACITY_REGION_C_KEY]: 300,
        [RESERVATION_TIMING_KEY]: "lock-in-now",
      },
    },
    incidentState: "min-breached-arrived",
    values: {
      reservedCapacityTotalUnits: 900,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "locked-in-on-time",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: breachedHealth,
  },
  {
    id: "baseline-breached-arrived",
    when: { triggerEquals: { eventArrived: true } },
    incidentState: "baseline-breached-arrived",
    values: {
      reservedCapacityTotalUnits: 0,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "breached",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "undecided",
      reservationWasteStatus: "efficient",
      capacitySeverity: "critical",
    },
    componentHealth: breachedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // DECISION WINDOW STILL OPEN — the event has not arrived yet. A green
  // system here never equals a safe handback: no real exposure has
  // happened, regardless of how adequate the current dial settings
  // look. criticalWorkloadProtectionStatus stays "not-yet-exposed"
  // throughout, which is what keeps this phase out of both
  // successCondition and acceptableCondition (see revenue-and-cost.ts).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "decision-window-open",
    when: { triggerEquals: { decisionWindowOpen: true } },
    incidentState: "decision-window-open",
    values: {
      reservedCapacityTotalUnits: 0,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "not-yet-exposed",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "undecided",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── Default/fallback: before the decision window even opens. ────────
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      reservedCapacityTotalUnits: 0,
      onDemandExposureUnits: 0,
      wastedReservedCapacityUnits: 0,
      cumulativeDeadlineMissExposureUnits: 0,
      criticalWorkloadProtectionStatus: "not-yet-exposed",
      regionalConcentrationStatus: "balanced",
      reservationDecisionStatus: "undecided",
      reservationWasteStatus: "efficient",
      capacitySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
