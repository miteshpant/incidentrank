import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dataRetentionPolicyMisconfigurationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const dataRetentionPolicyMisconfigurationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Compliance severity, deliberately independent of
      // Application/Event Store componentHealth (which never leaves
      // "healthy" anywhere in this scenario — see rules.ts). This is
      // what drives reliability's criticalTimeRatio measure in
      // scoring.ts: time spent with a compliance violation genuinely
      // live on EITHER data class, never time spent with availability
      // degraded.
      key: "complianceSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: a retention/deletion compliance violation is now live on at least one data class.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: no retention/deletion compliance violation is currently live on either data class.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/PERMANENT damage (binding requirement): a wrongly-
      // deleted Financial Record cannot be un-deleted — trackPeak:true
      // is what makes this genuinely non-resetting: state.peaks.
      // peakValues computes Math.max(previousPeak, currentValue) every
      // tick regardless of which rule currently matches (tick.ts), so
      // even once a candidate corrects the policy and
      // values.financialRecordsWronglyDeletedCount returns to a lower
      // live number (or the live field itself simply isn't incremented
      // further), the peak this attempt actually reached stays
      // recorded for the rest of the attempt.
      key: "financialRecordsWronglyDeletedCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one Financial Record has been wrongly purged during this incident — a permanent loss that will not be undone by any later policy fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further Financial Records are currently being wrongly purged.",
      },
    },
    {
      // Independent historical exposure on the SECOND data class — the
      // panic-pause-all trap's (or a direct wrong-class suspension's)
      // own permanent damage record, tracked separately from Financial
      // Records so neither violation can hide behind the other's
      // number.
      key: "userDeletionRequestOverdueCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: at least one User-Deletion-Request has aged past its mandated erasure deadline during this incident.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No User-Deletion-Request is currently past its mandated erasure deadline.",
      },
    },
    {
      key: "financialRecordsComplianceRatePercent",
      trackPeak: false,
    },
    {
      key: "ephemeralLogExcessStorageGb",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: dataRetentionPolicyMisconfigurationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (same style/rigor as the Phase 6E
  // siblings) ───────────────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (financialRecordsRetentionStatus /
  // financialRecordsComplianceRatePercent /
  // userDeletionRequestRetentionStatus /
  // financialRecordsWronglyDeletedCount):
  //
  //   healthy-default                                 N/A (pre-incident)
  //   baseline-misconfigured                           UNSAFE   78/actively-violated/compliant/55
  //   baseline-sustained-misconfigured                 UNSAFE   55/actively-violated/compliant/420
  //   panic-pause-all-classes-active                   UNSAFE   85/actively-violated/deadline-breached/60
  //   panic-pause-all-classes-sustained                UNSAFE   62/actively-violated/deadline-breached/180
  //   legal-hold-breach-trap                           UNSAFE   80/actively-violated/compliant/95
  //   wrong-class-suspended-sustained                  UNSAFE   80/compliant/deadline-breached/95
  //   corrected-before-sustained                       ACCEPTABLE 90/compliant/compliant/18
  //   just-corrected-no-drain-yet                      ACCEPTABLE 80/compliant/compliant/95
  //   draining-window1-audited-validated               ACCEPTABLE 92/compliant/compliant/40
  //   draining-window1-direct-unvalidated              ACCEPTABLE 88/compliant/compliant/95
  //   draining-window1-audited-unvalidated             ACCEPTABLE 90/compliant/compliant/70
  //   draining-window1-unaudited-validated             ACCEPTABLE 90/compliant/compliant/65
  //   fully-recovered-audited-validated                OPTIMAL  100/compliant/compliant/40
  //   fully-recovered-direct-unvalidated                OPTIMAL  100/compliant/compliant/95
  //   fully-recovered-audited-unvalidated               OPTIMAL  100/compliant/compliant/70
  //   fully-recovered-unaudited-validated               OPTIMAL  100/compliant/compliant/65
  //   fully-recovered-direct-unvalidated-logs-suspended OPTIMAL  100/compliant/compliant/95
  //
  // Every UNSAFE state fails successCondition AND acceptableCondition
  // for a real, named reason: financialRecordsRetentionStatus !=
  // "compliant" (an actively-happening Financial Records violation —
  // never acceptable regardless of how healthy Application/Event Store
  // look) OR userDeletionRequestRetentionStatus != "compliant" (the
  // independent secondary-class violation — the panic-pause trap and a
  // direct wrong-class suspension both fail this exact same gate, from
  // two different root causes). None of this is "almost fixed by
  // coincidence of rounding" — each fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // the corrected-but-still-draining family ───────────────────────────
  // Every one of these states has financialRecordsRetentionStatus ===
  // "compliant" AND userDeletionRequestRetentionStatus === "compliant"
  // — no live violation is happening on EITHER class in any of them.
  // This is the scenario's required legitimate degraded-but-safe tier:
  // the targeted correction has genuinely stopped the bleeding and
  // created no new violation, even though the fleet-wide compliance
  // RATE has not yet fully re-validated every in-scope record. Exactly
  // the judgment call a Principal engineer is expected to make and be
  // willing to hand back rather than wait out the full drain window.
  //
  // ── Why OPTIMAL requires BOTH compliance===100 AND
  // retentionStatus===compliant on both classes ───────────────────────
  // successCondition additionally requires
  // financialRecordsComplianceRatePercent === 100 (not merely "no live
  // violation right now") — the fleet-wide re-validation sweep must
  // have genuinely finished. This is what separates OPTIMAL from
  // ACCEPTABLE even though both tiers already satisfy "no live
  // violation on either class."
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // Every "fully-recovered-*" rule's live
  // values.financialRecordsWronglyDeletedCount authors a nonzero number
  // (the live field here answers "how many were wrongly deleted during
  // this incident, cumulatively, as of now" — a per-rule snapshot, not
  // a per-tick accumulator) and state.peaks.peakValues.
  // financialRecordsWronglyDeletedCount (trackPeak:true, computed
  // generically by the engine as Math.max every tick) remains
  // permanently at the attempt's true worst point for the rest of the
  // attempt — never reset by reaching a clean rule state, proven
  // explicitly by this scenario's non-resetting-peak test.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "no live violation, still draining" (ACCEPTABLE —
  // a deliberate, genuinely safe handback) and "fully re-validated"
  // (OPTIMAL) is a real system-state distinction, but deciding WHETHER
  // handing back at the safe-but-still-draining point is acceptable —
  // as opposed to waiting for the full re-validation sweep, or paying
  // for a validation pass before rollout — is a genuine Principal-level
  // judgment call, not something the engine should auto-resolve the
  // instant a threshold is crossed. This mirrors every other Phase 6E
  // candidate_declared sibling's completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is baseline-misconfigured
  // (financialRecordsRetentionStatus "actively-violated",
  // complianceRatePercent 78), which satisfies neither successCondition
  // (retentionStatus != "compliant") nor acceptableCondition (same
  // gate). evaluateCandidateDeclaredFinish therefore returns
  // outcome: "declared_unstable" — the expected default, especially
  // important here since every live availability metric already reads
  // green at this exact moment (the strategy spec's binding
  // "availability is largely irrelevant" framing).
  completion: { mode: "candidate_declared", acceptableCondition },
};
