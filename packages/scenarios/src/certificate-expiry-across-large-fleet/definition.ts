import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { certificateExpiryAcrossLargeFleetRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const certificateExpiryAcrossLargeFleetSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Connection-rejection severity, read by reliability's
      // criticalTimeRatio measure: time spent with a LIVE
      // connection-rejecting condition on any cohort OR the
      // validation-bypass trap active — never time spent merely
      // "deadline approaching but nothing has actually failed yet."
      key: "fleetConnectionSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: a live connection-rejecting condition is now active on at least one cohort.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: no connection-rejecting condition is currently active on any cohort.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/PERMANENT damage (binding requirement): a rejected
      // connection during an outage window cannot be un-rejected —
      // trackPeak:true is what makes this genuinely non-resetting:
      // state.peaks.peakValues computes Math.max(previousPeak,
      // currentValue) every tick regardless of which rule currently
      // matches (tick.ts), so even once a candidate closes the gap or
      // finishes the rotation and the live field returns to 0, the
      // peak this attempt actually reached stays recorded for the rest
      // of the attempt.
      key: "cumulativeRejectedConnectionCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one External Client connection has been rejected during this incident — a real, permanent mark on this attempt's record that no later fix erases.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further connections are currently being rejected.",
      },
    },
    {
      // Independent historical exposure: the validation-bypass trap's
      // own permanent security-violation record, tracked separately so
      // it can never hide behind (or be confused with) the
      // connection-rejection count above.
      key: "cumulativeValidationBypassedConnectionCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one connection has been served with certificate validation disabled during this incident — a permanent security-policy violation on the record, independent of whether any certificate actually expired.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further connections are currently being served with validation disabled.",
      },
    },
    {
      key: "loadBalancerConnectionSuccessRatePercent",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: certificateExpiryAcrossLargeFleetRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (same style/rigor as every Phase 6E
  // sibling) ───────────────────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (fleetConnectionStatus / modernCohortRotationStatus
  // / criticalCohortRotationStatus / legacyCohortRotationStatus /
  // cumulativeRejectedConnectionCount):
  //
  //   healthy-default                                         N/A (pre-incident only)
  //   deadline-risk-unaddressed                                UNSAFE   deadline-risk-unaddressed
  //   bypass-active / bypass-sustained                         UNSAFE   validation-bypassed
  //   premature-gap / premature-gap-sustained                  UNSAFE   premature-gap-outage
  //   false-claim-overlap-never-opened                         UNSAFE   deadline-risk-unaddressed
  //   expiry-deadline-missed(-sustained)                       UNSAFE   expiry-outage
  //   expiry-deadline-missed-partial(-sustained)                UNSAFE   expiry-outage
  //   expiry-deadline-missed-critical-rotated(-sustained)       UNSAFE   expiry-outage
  //   expiry-deadline-missed-legacy-bridged(-sustained)         UNSAFE   expiry-outage
  //   expiry-deadline-missed-false-claim-all-cohorts(-sustained) UNSAFE  expiry-outage
  //   false-bridge-legacy-not-engaged                          ACCEPTABLE nominal (false claim, not yet unsafe)
  //   gap-just-rolled-back / gap-recovering-window1 / gap-recovered  ACCEPTABLE nominal (recovering/recovered)
  //   overlap-opened-no-progress                               ACCEPTABLE nominal
  //   modern-rotated-progress / critical-rotated-progress / legacy-bridged-progress  ACCEPTABLE nominal
  //   all-cohorts-rotated-overlap                              OPTIMAL  nominal + all 3 verified-rotated (cleanup pending)
  //   fully-rotated-safe                                       OPTIMAL  nominal + all 3 verified-rotated (fully cleaned up)
  //
  // Every UNSAFE state fails successCondition AND acceptableCondition
  // for a real, named reason: fleetConnectionStatus !== "nominal" —
  // whether the cause is a deterministic calendar-driven expiry, a
  // self-inflicted premature-revocation sequencing mistake, a
  // validation-bypass trap that keeps the raw success-rate number
  // looking perfectly healthy, or deadline risk that has simply never
  // been addressed at all (the zero-action default). None of these is
  // "almost fixed by coincidence of rounding" — each fails the
  // identical, explicit gate. The full default-value path completeness
  // audit (every control combination x 6 calendar checkpoints) is
  // covered by this scenario's own exhaustive regression test — see
  // the "Default-value path completeness" describe block in the test
  // file, including two real fallthrough defects this audit itself
  // found and fixed (cohortRolloutStage values "critical-rotated"/
  // "legacy-bridged"/"all-cohorts-rotated" each needed their own
  // explicit post-deadline rule; cohortRolloutStage advanced without
  // certificateOverlapWindow ever being opened needed its own explicit
  // false-claim guard, both before and after the deadline).
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // the mid-rotation-but-safe family ───────────────────────────────────
  // Every one of these states has fleetConnectionStatus === "nominal"
  // — no connection is currently being rejected and no validation-
  // bypass trap is active in any of them, even though not every
  // cohort has finished rotating yet. This is the scenario's required
  // legitimate degraded-but-safe tier: the safe overlap mechanism is
  // genuinely engaged and nothing is currently broken, even though the
  // fleet has not yet reached its fully-cleaned-up end state. Exactly
  // the judgment call a Senior-Staff engineer is expected to make and
  // be willing to hand back rather than wait out the full multi-cohort
  // rollout.
  //
  // ── Why OPTIMAL requires ALL THREE cohorts verified-rotated ──────────
  // successCondition additionally requires modernCohortRotationStatus,
  // criticalCohortRotationStatus, AND legacyCohortRotationStatus to all
  // read "verified-rotated" (not merely "no connection is currently
  // being rejected right now") — every cohort's deadline risk must be
  // genuinely retired, not merely "not yet triggered." This is what
  // separates OPTIMAL from ACCEPTABLE even though both tiers already
  // satisfy "nothing is currently being rejected."
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // Every "premature-gap-*"/"expiry-deadline-missed-*"/"bypass-*"
  // rule's live cumulativeRejectedConnectionCount/cumulativeValidation-
  // BypassedConnectionCount authors a nonzero number (a per-rule
  // snapshot of "how many connections were rejected/bypassed during
  // this incident, cumulatively, as of now" — not a per-tick
  // accumulator), and state.peaks.peakValues for both fields
  // (trackPeak:true, computed generically by the engine as Math.max
  // every tick) remains permanently at the attempt's true worst point
  // for the rest of the attempt — never reset by later reaching
  // fully-rotated-safe, proven explicitly by this scenario's
  // non-resetting-peak tests.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "nominal, still mid-rotation" (ACCEPTABLE — a
  // deliberate, genuinely safe handback) and "every cohort fully
  // rotated and cleaned up" (OPTIMAL) is a real system-state
  // distinction, but deciding WHETHER handing back at the safe-but-
  // incomplete point is acceptable — as opposed to finishing every
  // cohort's rotation and revoking the old certificate — is a genuine
  // Senior-Staff-level judgment call, not something the engine should
  // auto-resolve the instant a threshold is crossed. This mirrors
  // every other Phase 6E candidate_declared sibling's completion-mode
  // reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident (T-72h) and immediately calling Finish with
  // zero actions: every control is still at its default
  // (certificateOverlapWindow:"closed", cohortRolloutStage:
  // "not-started"), so the matched rule is "deadline-risk-unaddressed"
  // — fleetConnectionStatus reads "deadline-risk-unaddressed", NOT
  // "nominal" (this field is the binding "a green system must never
  // equal a safe handback if deadline/risk remains unresolved"
  // safeguard — see rules.ts's doc comment and the matching regression
  // test proving a zero-action attempt never spuriously becomes
  // Finish-eligible no matter how long it is left alone before the
  // deadline). This already fails both successCondition and
  // acceptableCondition outright, independent of the sustain-window
  // mechanics below. Separately, and just as decisively:
  // evaluateCompletionEligibility gates on
  // state.transitions.consecutiveAcceptableSeconds, which tick.ts only
  // ever increments while incidentStartedAtMs !== null AND the
  // condition holds continuously — a zero-action Finish called the
  // INSTANT the incident starts has had no time to accumulate the
  // 30-second sustain window at all. evaluateCandidateDeclaredFinish
  // therefore correctly returns "declared_unstable" — see the
  // dedicated test, exercised at multiple points in the timeline
  // including right after the incident starts, at T-6h, and after the
  // deadline is missed, every live metric still reading green.
  completion: { mode: "candidate_declared", acceptableCondition },
};
