import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { emergencyCapacityReservationDecisionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CONTINGENCY_RESERVE_KEY,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const emergencyCapacityReservationDecisionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "capacitySeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: Critical-Tier workload currently has a live capacity shortfall.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: Critical-Tier workload no longer has a live capacity shortfall.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/PERMANENT consequence (binding requirement): every
      // tick spent at reservationTiming="wait" after the deadline has
      // passed, while the event is live, is real exposure that cannot
      // be un-happened later — trackPeak:true is what makes this
      // genuinely non-resetting, exactly like Data Retention Policy
      // Misconfiguration's financialRecordsWronglyDeletedCount.
      key: "cumulativeDeadlineMissExposureUnits",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: real exposure has now accrued from the reservation never having been locked in before the deadline — this cannot be undone by locking in later.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further deadline-miss exposure is currently accruing.",
      },
    },
    {
      key: "reservedCapacityTotalUnits",
      trackPeak: false,
    },
    {
      key: "wastedReservedCapacityUnits",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: emergencyCapacityReservationDecisionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit ────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (criticalWorkloadProtectionStatus /
  // regionalConcentrationStatus / reservationWasteStatus /
  // reservationDecisionStatus):
  //
  //   healthy-default                    N/A (pre-attempt)
  //   decision-window-open               N/A (not-yet-exposed — no real
  //                                        exposure has happened yet)
  //   deadline-missed-no-exposure-yet    N/A (not-yet-exposed)
  //   deadline-missed-event-arrived      UNSAFE   breached
  //   deadline-missed-event-sustained    UNSAFE   breached
  //   baseline-breached-arrived          UNSAFE   breached
  //   min-breached-arrived               UNSAFE   breached
  //   min-breached-sustained             UNSAFE   breached
  //   thin-mismatch-breached-sustained   UNSAFE   breached
  //   conc-disrupted                     UNSAFE   breached + concentrated
  //   mid-disrupted-no-fallback          UNSAFE   breached
  //   thin-at-risk-arrived               ACCEPTABLE at-risk, balanced
  //   mid-acceptable-sustained-undeclared ACCEPTABLE at-risk, balanced
  //   conc-arrived                       neither (protected but
  //                                        concentrated — real, disclosed
  //                                        hidden risk; fails both
  //                                        successCondition's "balanced"
  //                                        gate and acceptableCondition's
  //                                        "at-risk" gate)
  //   conc-undisrupted-sustained         neither (same reason)
  //   thin-rescued-by-fallback-sustained OPTIMAL  protected, balanced,
  //                                        efficient, locked-in-on-time
  //   mid-disrupted-fallback-enabled     OPTIMAL  same four gates
  //   high-disrupted                     OPTIMAL  same four gates
  //   high-optimal-arrived               OPTIMAL  same four gates
  //   mid-optimal-arrived                OPTIMAL  same four gates
  //   high-optimal-sustained             OPTIMAL  same four gates
  //   mid-optimal-sustained-full         OPTIMAL  same four gates
  //   mid-optimal-sustained-fallback-only OPTIMAL same four gates
  //   high-waste-sustained               neither (protected + balanced +
  //                                        locked-in-on-time, but
  //                                        reservationWasteStatus=
  //                                        "wasteful" — fails
  //                                        successCondition's "efficient"
  //                                        gate, and fails
  //                                        acceptableCondition's
  //                                        "at-risk" gate since this
  //                                        state is "protected", not
  //                                        "at-risk" — see this
  //                                        scenario's Score Integrity /
  //                                        Option D investigation in the
  //                                        completion report for why
  //                                        this is the correct, honest
  //                                        outcome rather than a bug)
  //   high-waste-arrived                 neither (same reason as
  //                                        high-waste-sustained — the
  //                                        arrival-tier counterpart,
  //                                        added so the maximal-waste
  //                                        trap cannot be bypassed by
  //                                        calling Finish during the
  //                                        arrival-only window, before
  //                                        eventSustained fires)
  //
  // ── Why CONC (undisrupted) and the maximal-waste trap are
  // deliberately neither OPTIMAL nor ACCEPTABLE ───────────────────────
  // Both states look entirely fine on the live headroom check right up
  // until examined against the SECOND, independent judgment axis this
  // scenario tests (regional distribution, or cost discipline). Letting
  // either one pass as a genuine completion would silently reward
  // exactly the trap this scenario is built to catch. A candidate who
  // reaches either state and calls Finish correctly receives
  // "declared_unstable" — not a crash, not a false pass — and must
  // correct the underlying judgment gap (rebalance the regions, or drop
  // the contingency reserve) to reach a real completion.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is correct for the
  // at-risk family ─────────────────────────────────────────────────────
  // thin-at-risk-arrived and mid-acceptable-sustained-undeclared both
  // have criticalWorkloadProtectionStatus==="at-risk" (thin but
  // genuinely nonzero headroom, never "breached") AND
  // regionalConcentrationStatus==="balanced" (no hidden risk) AND the
  // decision was locked in on time. This is a real, operationally
  // defensible handback — exactly the judgment call a Principal
  // engineer is expected to be willing to make rather than always
  // reaching for the most expensive, safest-possible reservation level.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident (the decision window opening) and
  // immediately calling Finish with zero actions: the matched rule is
  // decision-window-open (criticalWorkloadProtectionStatus
  // "not-yet-exposed"), which satisfies neither successCondition
  // ("protected" required) nor acceptableCondition ("at-risk" required).
  // evaluateCandidateDeclaredFinish therefore returns outcome
  // "declared_unstable" — the expected default. This is especially
  // important for this scenario's proactive framing: a green system
  // before the event ever arrives must never equal a safe handback,
  // since the real test (did the reservation decision hold up against
  // actual demand) has not happened yet.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // Deciding whether a thin-but-nonzero headroom margin (ACCEPTABLE) is
  // good enough to hand back, versus waiting for/paying for a fully
  // optimal reservation level, is a genuine Principal-level judgment
  // call under real cost tradeoffs — not something the engine should
  // auto-resolve the instant a threshold is crossed. This mirrors every
  // other Phase 6E candidate_declared sibling's completion-mode
  // reasoning exactly.
  completion: { mode: "candidate_declared", acceptableCondition },
};
