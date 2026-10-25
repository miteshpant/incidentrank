import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { globalFeatureRolloutIncidentRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const globalFeatureRolloutIncidentSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "storeCompatibilityStatus",
      // No announceCritical — storeCompatibilityStatus's value set is
      // {diverging, contained, compatible, incident-free}, not the
      // generic {normal, warning, critical} severity vocabulary, so it
      // is intentionally NOT declared as a severity field (same
      // reasoning as authorization-policy-rollout-failure's
      // fleetVersionSkewStatus).
    },
  ],
  numericWatchFields: [
    {
      key: "alreadyIncompatibleWriteCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "At least one customer record has been written under the new, incompatible representation during this incident — a historical consequence that rollback alone will not erase.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further incompatible writes are currently being created.",
      },
    },
    {
      key: "repairedRecordCount",
      trackPeak: true,
    },
    {
      key: "unreadableReadCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Reads against already-written incompatible records are currently failing.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Reads against previously-incompatible records are succeeding again.",
      },
    },
    {
      key: "euCorrectnessRate",
      trackPeak: false,
    },
    {
      key: "usCorrectnessRate",
      trackPeak: false,
    },
    {
      key: "apacCorrectnessRate",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: globalFeatureRolloutIncidentRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.4.md section 11, same style/rigor
  // as authorization-policy-rollout-failure/definition.ts and
  // distributed-coordination-failure/definition.ts) ───────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (euCorrectness/usCorrectness/apacCorrectness %
  // / alreadyIncompatibleWriteCount / repairedRecordCount /
  // unreadableReadCount / storeCompatibilityStatus / rolloutStatus):
  //
  //   healthy-default                      N/A (pre-incident)
  //   baseline-diverging                   UNSAFE  62/90/92  / 120/0/45   / diverging  / active
  //   us-halted-only                        UNSAFE  55/100/88 / 200/0/65   / diverging  / active
  //   eu-halted-only                        UNSAFE  100/80/85 / 210/0/70   / diverging  / active
  //   paused-still-writing                  UNSAFE  58/88/90  / 230/0/80   / diverging  / active
  //   sustained-widening                    UNSAFE  35/60/65  / 980/0/540  / diverging  / active
  //   catastrophic-widening                 UNSAFE  10/30/35  / 1650/0/1200/ diverging  / active
  //   racing-repair                         UNSAFE  70/92/94  / 340/0/60   / diverging  / active
  //   rollback-no-repair-unreadable          UNSAFE  62/85/88  / 180/0/95   / contained  / rolled-back
  //   rollback-no-repair-sustained-unreadable UNSAFE 55/78/82  / 640/0/410  / contained  / rolled-back
  //   dual-write-contained                  ACCEPTABLE 90/95/96 / 150/0/25  / contained  / active-dual-write
  //   repairing-window1                     UNSAFE  80/94/96  / 220/70/42  / contained  / regionally-halted
  //   repairing-window2                     UNSAFE  92/97/98  / 220/165/18 / contained  / regionally-halted
  //   repair-fully-done (halted variant)    OPTIMAL 100/100/100 / 220/220/0 / compatible / regionally-halted
  //   repair-fully-done (rollback variant)  OPTIMAL 100/100/100 / 180/180/0 / compatible / rolled-back
  //   rollback-with-shim                    OPTIMAL 100/100/100 / 180/0/0   / compatible / rolled-back
  //
  // Every UNSAFE state fails successCondition for a real, named reason:
  // either unreadableReadCount > 0 (reads against the backlog are
  // genuinely failing right now), or at least one region's correctness
  // rate is below 100 (a region is still diverging), or
  // storeCompatibilityStatus is not yet "compatible". None of these is
  // "almost fixed by coincidence" — each fails a real, named gate. In
  // particular rollback-no-repair-unreadable PROVES the required
  // sequencing trap: rollback happened, growth genuinely stopped
  // (alreadyIncompatibleWriteCount is frozen, not climbing), yet
  // unreadableReadCount is real and nonzero — rollback alone is never
  // sufficient to satisfy successCondition.
  //
  // ACCEPTABLE (dual-write-contained) is the ONE genuine bounded
  // tradeoff: new incompatible writes have stopped being CREATED
  // (dual-write populates both representations going forward), but the
  // pre-existing backlog from before dual-write was engaged remains
  // genuinely outstanding (storeCompatibilityStatus stays "contained",
  // never "compatible", unreadableReadCount sits at a real, bounded,
  // non-zero 25). Deciding whether this bounded, non-growing exposure is
  // "safe enough to hand back" while a candidate separately decides
  // whether to also run repair is a genuine Principal-level judgment
  // call — not an objective zero/nonzero gate — which is why this
  // scenario needs a real acceptable tier.
  //
  // OPTIMAL requires unreadableReadCount === 0 AND
  // storeCompatibilityStatus === "compatible" AND every region's
  // correctness rate === 100 — reachable via THREE genuinely distinct
  // mechanisms: regional-halt + full repair window elapsed,
  // global-rollback + full repair window elapsed, OR global-rollback +
  // the read-compatibility shim (no repair-window wait required at all).
  // All three are authored to reach an equally safe end state via
  // materially different levers, proving multiple strong paths are
  // genuinely, independently viable.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // Both repair-fully-done variants author `values.alreadyIncompatibleWriteCount`
  // as the real total ever written (220 or 180) — NOT reset to 0 — with
  // `values.repairedRecordCount` equal to it, which is how the live rule
  // state proves "fully repaired" without pretending the incident never
  // happened. The shim variant instead keeps alreadyIncompatibleWriteCount
  // at 180 with repairedRecordCount at 0 forever (the underlying rows were
  // never rewritten, only made readable) — a real, permanent, candidate-
  // visible record of what happened, in both cases never erased by
  // reaching the safe handback state. state.peaks.peakValues.
  // alreadyIncompatibleWriteCount (a numericWatchField with
  // trackPeak:true, computed generically by the engine via Math.max
  // every tick) additionally guarantees that even a later rule authoring
  // a LOWER live value could never understate how high the backlog ever
  // climbed during this attempt — the same non-self-resetting mechanism
  // Authorization Policy Rollout Failure and Ledger Reconciliation
  // Divergence rely on, generalized rather than reinvented here.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between a genuinely-fixed-but-still-unrepaired state
  // (UNSAFE — unreadableReadCount > 0) and the deliberate bounded
  // tradeoff of dual-write-contained (ACCEPTABLE) is a real system-state
  // distinction, but deciding WHETHER a given amount of bounded,
  // non-growing read-incompatibility exposure is "safe enough to hand
  // back" — versus continuing to wait out full repair or engaging the
  // shim for the OPTIMAL state — is a genuine Principal-level judgment
  // call, not a threshold the engine should auto-resolve the instant
  // it's crossed. This mirrors Authorization Policy Rollout Failure's
  // identical reasoning: an acceptable tier that is correctness-safe but
  // intentionally imperfect is best modeled as a declared handback.
  completion: {
    mode: "candidate_declared",
    acceptableCondition,
  },
};
