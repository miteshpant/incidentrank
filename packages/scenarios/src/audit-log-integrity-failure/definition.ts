import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { auditLogIntegrityFailureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
  DUPLICATE_HANDLING_KEY,
  FALLBACK_EVIDENCE_SOURCE_KEY,
  IMMUTABLE_STORE_POLICY_KEY,
  INGESTION_PAUSE_KEY,
  ORDERING_RECONSTRUCTION_KEY,
  RECONCILIATION_MODE_KEY,
  REPORT_PUBLICATION_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const auditLogIntegrityFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Evidence-integrity severity, deliberately independent of
      // Services/Audit Logger componentHealth (which never leaves
      // "healthy" anywhere in this scenario — see rules.ts). This is
      // what drives reliability's criticalTimeRatio measure in
      // scoring.ts: time spent with an evidence-integrity violation
      // genuinely live, never time spent with availability degraded.
      key: "evidenceIntegritySeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: an evidence-integrity violation is now live.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: no evidence-integrity violation is currently live.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/PERMANENT damage (binding requirement #1): once an
      // audit event's evidence is genuinely gone, it cannot be
      // recovered later — trackPeak:true is what makes this genuinely
      // non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate engages a safe strategy and the live
      // unverifiableEventCount stops climbing (or even reads lower in a
      // later rule's snapshot), the peak this attempt actually reached
      // stays recorded for the rest of the attempt.
      key: "unverifiableEventCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one audit event has become permanently unverifiable during this incident — this cannot be undone by any later reconciliation.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further audit events are currently becoming unverifiable.",
      },
    },
    {
      // HISTORICAL/PERMANENT damage (binding requirement #2) —
      // independent second counter: once a compliance report has been
      // published while falsely certifying completeness, that
      // certification already went out and cannot be un-sent, even
      // after the underlying gap is later reconciled.
      key: "incorrectlyCertifiedReportCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one compliance report has been published while falsely certifying completeness the evidence did not support — a permanent record exposure that stands even after the gap is later closed.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No currently-standing report falsely certifies completeness.",
      },
    },
    {
      key: "eventCompletenessPercent",
      trackPeak: false,
    },
    {
      key: "reconciliationBacklogCount",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: auditLogIntegrityFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (same style/rigor as the Phase 6E
  // siblings) ───────────────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (reportTrustStatus / tamperEvidenceStatus /
  // eventCompletenessPercent / orderingConfidencePercent /
  // unverifiableEventCount):
  //
  //   healthy-default                                     N/A (pre-incident)
  //   baseline-degraded                                    UNSAFE   untrustworthy/intact/80/72, tier=violated
  //   baseline-sustained-degraded                           UNSAFE   untrustworthy/intact/62/58, tier=violated
  //   publish-as-is-active                                  UNSAFE   untrustworthy/intact/75/68
  //   publish-as-is-sustained                               UNSAFE   untrustworthy/intact/58/55
  //   immutable-store-tampered                              UNSAFE   untrustworthy/compromised/70/60
  //   unverified-report-unflagged-sustained                 UNSAFE   untrustworthy/intact/60/58
  //   ordering-untrustworthy-sustained                      UNSAFE   untrustworthy/intact/94/45, tier=violated
  //   path-a-corrected-before-sustained                     ACCEPTABLE trustworthy/intact/85/82
  //   path-b-corrected-before-sustained                     ACCEPTABLE trustworthy/intact/83/80
  //   path-a-just-engaged-no-drain-yet                      ACCEPTABLE trustworthy/intact/75/70
  //   path-b-just-engaged-no-drain-yet                      ACCEPTABLE trustworthy/intact/72/68
  //   path-a-draining-window1                               ACCEPTABLE trustworthy/intact/90/92
  //   path-b-draining-window1                               ACCEPTABLE trustworthy/intact/88/90
  //   path-a-fully-reconciled-ingestion-default             OPTIMAL  trustworthy/intact/100/100
  //   path-a-fully-reconciled-ingestion-paused              OPTIMAL  trustworthy/intact/100/100
  //   path-b-fully-reconciled-flagged                       OPTIMAL  trustworthy/intact/100/100
  //   path-b-fully-reconciled-flagged-fallback-enabled      OPTIMAL  trustworthy/intact/100/100
  //
  // Every UNSAFE state fails successCondition AND acceptableCondition
  // for a real, named reason: reportTrustStatus != "trustworthy" (a
  // falsely-clean report currently stands — never acceptable regardless
  // of how healthy Services/Audit Logger look) OR tamperEvidenceStatus
  // != "intact" (immutable history has been rewritten — the most severe
  // violation, independent of the report trust status at the moment it
  // happens) OR — for ordering-untrustworthy-sustained specifically —
  // orderingConfidencePercent reads far below its healthy bound with no
  // control engaged to raise it, keeping successCondition's
  // orderingConfidencePercent===100 requirement permanently unmet in
  // that family. None of this is "almost fixed by coincidence of
  // rounding" — each fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // the corrected-but-still-draining family ───────────────────────────
  // Every one of these states has reportTrustStatus === "trustworthy"
  // AND tamperEvidenceStatus === "intact" — no live violation is
  // happening on EITHER axis in any of them. This is the scenario's
  // required legitimate degraded-but-safe tier: the chosen strategy has
  // genuinely stopped certifying anything falsely and never touched
  // immutable history, even though the fleet-wide reconciliation sweep
  // has not yet fully drained the backlog. Exactly the judgment call a
  // Principal engineer is expected to make and be willing to hand back
  // rather than wait out the full drain window.
  //
  // ── Why OPTIMAL requires BOTH completeness===100 AND
  // orderingConfidence===100 on top of trustworthy/intact ─────────────
  // successCondition additionally requires eventCompletenessPercent===
  // 100 AND orderingConfidencePercent===100 (not merely "no live
  // violation right now") — the fleet-wide reconciliation sweep must
  // have genuinely finished. This is what separates OPTIMAL from
  // ACCEPTABLE even though both tiers already satisfy "no live
  // violation on either axis."
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // Every "path-*-fully-reconciled-*" rule's live
  // values.unverifiableEventCount authors a nonzero number (the live
  // field here answers "how many became unverifiable during this
  // incident, cumulatively, as of now" — a per-rule snapshot, not a
  // per-tick accumulator) and state.peaks.peakValues.
  // unverifiableEventCount (trackPeak:true, computed generically by the
  // engine as Math.max every tick) remains permanently at the attempt's
  // true worst point for the rest of the attempt — never reset by
  // reaching a clean rule state, proven explicitly by this scenario's
  // non-resetting-peak tests (two independent counters).
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "no live violation, still draining" (ACCEPTABLE —
  // a deliberate, genuinely safe handback) and "fully reconciled"
  // (OPTIMAL) is a real system-state distinction, but deciding WHETHER
  // handing back at the safe-but-still-draining point is acceptable —
  // as opposed to waiting for the full reconciliation sweep, or paying
  // for ingestion-pause/fallback-evidence-source to accelerate it — is
  // a genuine Principal-level judgment call, not something the engine
  // should auto-resolve the instant a threshold is crossed. This
  // mirrors every other Phase 6E candidate_declared sibling's
  // completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is baseline-degraded, authored with
  // reportTrustStatus "untrustworthy" precisely BECAUSE no safe
  // remediation lever has been engaged yet while the degradation is
  // active (see metrics.ts's reportTrustStatus doc comment — this is a
  // deliberate design decision so "doing nothing" is never scored as
  // if it were already safe). This satisfies neither successCondition
  // nor acceptableCondition (both require reportTrustStatus ===
  // "trustworthy"). evaluateCandidateDeclaredFinish therefore returns
  // outcome: "declared_unstable" — the expected default, especially
  // important here since every live availability metric already reads
  // green at this exact moment. Verified directly by this scenario's
  // dedicated immediate-Finish regression test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
