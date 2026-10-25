import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { overprovisionedResilienceDuringLowRiskPeriodRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const overprovisionedResilienceDuringLowRiskPeriodSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "cumulativeUnabsorbedFailoverDrillCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "A scheduled single-AZ failure drill found the resilience floor violated and could not be fully absorbed — a permanent historical consequence that will not be erased by restoring the floor afterward.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further unabsorbed failover drills are currently in progress.",
      },
    },
    {
      key: "monthlyInfrastructureCostUsd",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: overprovisionedResilienceDuringLowRiskPeriodRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e2.md's binding requirements 10, 12,
  // 13), same style/rigor as Privilege Escalation via Stale Authorization
  // Cache's and Identity Platform Degradation's own definition.ts audits.
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (resilienceFloorStatus / costPostureStatus /
  // cumulativeUnabsorbedFailoverDrillCount):
  //
  //   healthy                                   N/A (pre-incident)
  //   unreviewed-peak-posture-baseline           SAFE-BUT-WASTEFUL
  //     at-floor-or-above / unreviewed-peak-posture / 0
  //     (the only reachable zero-action state once the incident has
  //     started — every control's initial value already matches this
  //     rule's bare trigger constraint)
  //   unreviewed-peak-posture-sustained          SAFE-BUT-WASTEFUL
  //     at-floor-or-above / unreviewed-peak-posture / 0
  //   backup-floor-violation-silent              UNSAFE (silent)
  //     below-floor / reduced-below-floor / 0
  //   az-floor-violation-quiet                   UNSAFE (silent)
  //     below-floor / reduced-below-floor / 0
  //   failover-reserve-floor-violation-quiet     UNSAFE (silent)
  //     below-floor / reduced-below-floor / 0
  //   az-floor-violation-drill-hit               UNSAFE (exposed)
  //     below-floor / reduced-below-floor / 1
  //   az-floor-violation-drill-hit-second        UNSAFE (exposed, worse)
  //     below-floor / reduced-below-floor / 2 -> automatic FAILURE
  //   failover-reserve-floor-violation-drill-hit         UNSAFE (exposed)
  //     below-floor / reduced-below-floor / 1
  //   failover-reserve-floor-violation-drill-hit-second  UNSAFE (exposed, worse)
  //     below-floor / reduced-below-floor / 2 -> automatic FAILURE
  //   partial-safe-reduction-az-still-peak       ACCEPTABLE
  //     at-floor-or-above / reduced-partial-safe / 0
  //   safe-reduction-compute-first-engaging      transient (not yet settled)
  //     at-floor-or-above / reduced-to-baseline-safe / 0
  //   safe-reduction-compute-first-settled       OPTIMAL (strategy A)
  //     at-floor-or-above / reduced-to-baseline-safe / 0
  //   safe-reduction-data-plane-first-engaging   transient (not yet settled)
  //     at-floor-or-above / reduced-to-baseline-safe / 0
  //   safe-reduction-data-plane-first-settled    OPTIMAL (strategy B)
  //     at-floor-or-above / reduced-to-baseline-safe / 0
  //
  // ── Why the wasteful baseline is SAFE but never Finish-eligible ──────
  // unreviewed-peak-posture-* never violates the mandatory floor
  // (resilienceFloorStatus stays "at-floor-or-above" throughout), so it
  // can never fail. But costPostureStatus stays "unreviewed-peak-posture"
  // forever — neither successCondition's "reduced-to-baseline-safe" gate
  // nor acceptableCondition's "reduced-partial-safe" gate is ever
  // satisfied by this state alone, however long it is sustained. This is
  // the deliberate, binding answer to requirement 10's immediate-Finish
  // audit: "everything already looks green" must not accidentally
  // resolve as safe while the underlying cost/risk condition (needless,
  // unaddressed spend) is still materially unacceptable — a zero-action
  // Finish always returns declared_unstable here.
  //
  // ── Why a quiet below-floor violation is UNSAFE despite zero visible
  // consequence ────────────────────────────────────────────────────────
  // az-floor-violation-quiet / failover-reserve-floor-violation-quiet /
  // backup-floor-violation-silent all keep requestSuccessRate and
  // p99LatencyMs at their healthy ceiling — nothing on the dashboard
  // indicates a problem. resilienceFloorStatus explicitly reads
  // "below-floor" regardless, which is the required, concrete, testable
  // distinction between "the dashboard is green" and "the system is
  // actually safe" this scenario exists to teach. The ONLY reason the
  // live metrics stay green is that the periodic AZ-failure drill has
  // not fired yet within this attempt's elapsed window — a real,
  // authored, low-probability event, not a hypothetical one (see
  // timed-events.ts's FIRST_AZ_FAILURE_DRILL_MS /
  // SECOND_AZ_FAILURE_DRILL_MS).
  //
  // ── Historical damage survives restoring the floor ──────────────────
  // cumulativeUnabsorbedFailoverDrillCount only increments at the moment
  // an AZ/failover-floor violation is actually exercised by a drill
  // trigger; restoring the floor afterward stops future increments but
  // never decrements the live value in the restored rule family (every
  // safe rule state authors 0 for its own `values` snapshot — the SAME
  // limitation Identity Platform Degradation's and Privilege Escalation
  // via Stale Authorization Cache's own damage counters accept). What
  // never resets is state.peaks.peakValues.cumulativeUnabsorbedFailoverDrillCount
  // (a numericWatchField with trackPeak: true, computed generically by
  // the engine as Math.max every tick) — proven non-resetting by a real
  // test in the test file.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // Whether the stated operating baseline (ACCEPTABLE's partial
  // reduction, or OPTIMAL's full reduction) is "done enough" to hand
  // back is a genuine Staff-level judgment call about how much cost risk
  // is worth carrying while still formally reviewing further savings —
  // not something the engine should silently auto-resolve the instant a
  // threshold is crossed, mirroring every other candidate_declared
  // built-in scenario's reasoning.
  completion: { mode: "candidate_declared", acceptableCondition },
};
