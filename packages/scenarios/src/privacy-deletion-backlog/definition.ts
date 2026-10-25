import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { privacyDeletionBacklogRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const privacyDeletionBacklogSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "deletionIntegritySeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: an execution-completeness violation (false completion, deadline breach, or untracked obligation) is now live.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: no execution-completeness violation is currently live.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/PERMANENT damage (binding requirement #1 of 2): a
      // falsely-marked-complete request is a real, permanent audit-trail
      // falsehood — trackPeak:true makes this genuinely non-resetting:
      // state.peaks.peakValues computes Math.max every tick regardless
      // of which rule currently matches, so even once a candidate
      // corrects the policy and the live falseCompletionCount stops
      // climbing (or even reads a lower number under a different rule),
      // the peak this attempt actually reached stays recorded for the
      // rest of the attempt.
      key: "falseCompletionCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one deletion request has been falsely marked complete during this incident — a permanent audit-trail falsehood that will not be undone by any later policy fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further deletion requests are currently being falsely marked complete.",
      },
    },
    {
      // HISTORICAL/PERMANENT damage (binding requirement #2 of 2):
      // tracked independently from falseCompletionCount so neither
      // violation can hide behind the other's number — a deadline
      // breach from mis-prioritization is a real, independent fact even
      // once the backlog later drains and the request eventually
      // completes.
      key: "deadlineBreachedCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one deletion request has aged past its mandated deletion deadline during this incident.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No deletion request is currently past its mandated deletion deadline.",
      },
    },
    {
      key: "endToEndCompletionPercent",
      trackPeak: false,
    },
    {
      key: "deletionBacklogCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: privacyDeletionBacklogRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (same style/rigor as the Phase 6E
  // siblings) ───────────────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (deletionWorkflowStatus / endToEndCompletionPercent
  // / backupIndexTrackingStatus / falseCompletionCount /
  // deadlineBreachedCount):
  //
  //   healthy-default                                     N/A (pre-incident)
  //   baseline-untouched                                   UNSAFE   false-complete-active/78/tracked
  //   baseline-sustained-untouched                         UNSAFE   false-complete-active/58/tracked
  //   false-complete-active                                UNSAFE   false-complete-active/78/tracked
  //   false-complete-sustained                              UNSAFE   false-complete-active/58/tracked
  //   analytics-store-skipped-trap                         UNSAFE   backlog-draining/60/tracked (analyticsStoreCompletionPercent=0)
  //   backup-index-untracked-trap                          UNSAFE   untracked-gap-active/70/untracked
  //   deadline-breach-newest-first-trap                    UNSAFE   deadline-breach-active/72/tracked
  //   deadline-breach-newest-first-with-boost-trap          UNSAFE   deadline-breach-active/74/tracked
  //   deadline-breach-high-risk-first-no-boost-trap        UNSAFE   deadline-breach-active/73/tracked
  //   deadline-breach-newest-first-with-boost-pre-sustained-trap  UNSAFE   deadline-breach-active/88/tracked
  //   deadline-breach-high-risk-first-no-boost-pre-sustained-trap UNSAFE   deadline-breach-active/87/tracked
  //   corrected-before-sustained                            ACCEPTABLE backlog-draining/90/tracked
  //   just-corrected-no-drain-yet                           ACCEPTABLE backlog-draining/70/tracked
  //   draining-window1-path-a                              ACCEPTABLE backlog-draining/88/tracked
  //   draining-window1-path-b                              ACCEPTABLE backlog-draining/87/tracked
  //   fully-recovered-path-a-*  (4 worker/retry combos)    OPTIMAL  healthy/100/tracked
  //   fully-recovered-path-b-*  (4 worker/retry combos)    OPTIMAL  healthy/100/tracked
  //
  // Every UNSAFE state fails successCondition AND acceptableCondition
  // for a real, named reason: deletionWorkflowStatus is never "healthy"
  // or "backlog-draining" in any of them (it is one of
  // "false-complete-active" / "untracked-gap-active" /
  // "deadline-breach-active"), OR backupIndexTrackingStatus !=
  // "tracked". None of this is "almost fixed by coincidence of
  // rounding" — each fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // the corrected-but-still-draining family ───────────────────────────
  // Every one of these states has deletionWorkflowStatus ===
  // "backlog-draining" AND backupIndexTrackingStatus === "tracked" — no
  // live violation is happening in any of them (no false completion, no
  // deadline breach, no untracked obligation), even though the
  // fleet-wide end-to-end completion rate has not yet fully re-verified
  // every in-scope request. Exactly the judgment call a Senior-Staff
  // engineer is expected to make and be willing to hand back rather than
  // wait out the full drain window.
  //
  // ── Why OPTIMAL requires BOTH completion===100 AND
  // status===healthy ───────────────────────────────────────────────────
  // successCondition additionally requires endToEndCompletionPercent
  // === 100 (not merely "no live violation right now") — the fleet-wide
  // re-verification sweep must have genuinely finished. This is what
  // separates OPTIMAL from ACCEPTABLE even though both tiers already
  // satisfy "no live violation."
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // Every "fully-recovered-*" rule's live values.falseCompletionCount
  // and values.deadlineBreachedCount author 0 (the live field here
  // answers "is a violation happening right now" — a per-rule snapshot,
  // not a per-tick accumulator) while state.peaks.peakValues.
  // falseCompletionCount/deadlineBreachedCount (trackPeak:true, computed
  // generically by the engine as Math.max every tick) remain
  // permanently at the attempt's true worst point for the rest of the
  // attempt — never reset by reaching a clean rule state, proven
  // explicitly by this scenario's non-resetting-peak tests.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "no live violation, still draining" (ACCEPTABLE — a
  // deliberate, genuinely safe handback) and "fully re-verified"
  // (OPTIMAL) is a real system-state distinction, but deciding WHETHER
  // handing back at the safe-but-still-draining point is acceptable — as
  // opposed to waiting for the full re-verification sweep, or paying for
  // scaled-up workers to finish faster — is a genuine Senior-Staff-level
  // judgment call, not something the engine should auto-resolve the
  // instant a threshold is crossed. This mirrors every other Phase 6E
  // candidate_declared sibling's completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is baseline-untouched
  // (deletionWorkflowStatus "false-complete-active",
  // endToEndCompletionPercent 78), which satisfies neither
  // successCondition nor acceptableCondition. evaluateCandidateDeclaredFinish
  // therefore returns outcome: "declared_unstable" — the expected
  // default, especially important here since requestAcceptanceSuccessRate
  // already reads 100 at this exact moment (this scenario's own "healthy
  // dashboard hides the real problem" framing).
  completion: { mode: "candidate_declared", acceptableCondition },
};
