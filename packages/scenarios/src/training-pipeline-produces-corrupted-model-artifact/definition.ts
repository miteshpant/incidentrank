import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { trainingPipelineProducesCorruptedModelArtifactRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
  VALIDATION_COMPUTE_TIER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const trainingPipelineProducesCorruptedModelArtifactSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Artifact-TRUST severity, deliberately independent of
      // Trainer/Deployment Pipeline componentHealth (which never
      // leaves "healthy" anywhere in this scenario — see rules.ts).
      // This is what drives reliability's criticalTimeRatio measure in
      // scoring.ts: time spent with the artifact genuinely serving
      // untrusted output, never time spent with infrastructure itself
      // unavailable or slow.
      key: "artifactTrustSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: the corrupted artifact is now actively serving production traffic with no mitigation engaged.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: the corrupted artifact is no longer actively serving production traffic.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/CUMULATIVE business-risk exposure (phase6e3.md's
      // binding requirement, business invariant #5). trackPeak:true is
      // what makes this genuinely non-resetting: state.peaks.peakValues
      // computes Math.max(previousPeak, currentValue) every tick
      // regardless of which rule currently matches (tick.ts), so even
      // once a candidate quarantines the artifact and
      // values.cumulativeDecisionsOnCorruptedModel returns to 0, the
      // peak the attempt actually reached stays recorded and is what
      // scoring reads indirectly via the dataIntegrity/reliability
      // penalties on the string-state fields this count tracks
      // alongside.
      key: "cumulativeDecisionsOnCorruptedModel",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: a real business decision has been made using the corrupted model's output at least once during this incident — a permanent exposure that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further business decisions are currently being made on the corrupted model's output.",
      },
    },
    {
      key: "artifactValidationScore",
      trackPeak: false,
    },
    {
      key: "modelOutputErrorRatePercent",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: trainingPipelineProducesCorruptedModelArtifactRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e3.md, same style/rigor as Model
  // Feature Freshness Degradation / Privilege Escalation via Stale
  // Authorization Cache) ───────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (currentServingArtifactTrustStatus /
  // lineageAuditStatus / artifactRiskStatus /
  // cumulativeDecisionsOnCorruptedModel):
  //
  //   healthy-default                                        N/A (pre-incident)
  //   corrupted-serving-active                                UNSAFE  corrupted-serving/complete/corrupted-exposure/95
  //   corrupted-serving-sustained                             UNSAFE  corrupted-serving/complete/corrupted-exposure/420
  //     (automatic failureCondition reachable from here — see below)
  //   lineage-destroyed                                       UNSAFE  quarantined/compromised/lineage-destroyed/260
  //     (the single worst dataIntegrity outcome in the entire
  //     scenario, despite the LIVE serving field reading "quarantined"
  //     — the forensic record is permanently gone, not merely unsafe
  //     right now)
  //   rollback-last-known-good-full                           OPTIMAL trusted/complete/healthy/0
  //   hold-for-retrain-fully-validated-full-datacheck          OPTIMAL trusted/complete/healthy/0
  //   hold-for-retrain-fully-validated-full-skipdatacheck      OPTIMAL trusted/complete/healthy/0
  //     (both alternate strong paths reach the identical OPTIMAL
  //     artifactRiskStatus; costEfficiency/recovery are what
  //     differentiate their real tradeoffs — see scoring.ts)
  //   rollback-last-known-good-gated-unmarked                 ACCEPTABLE trusted/complete/safe-quarantined/0
  //   rollback-last-known-good-marked-weak-gate                ACCEPTABLE trusted/complete/safe-quarantined/0
  //   rollback-last-known-good-weak-gate                       ACCEPTABLE trusted/complete/safe-quarantined/0
  //     (DEFAULT-VALUE PATH COMPLETENESS case: promotionGateMode and
  //     distrustMarking both left untouched)
  //   hold-for-retrain-fully-validated-gated-unmarked-*         ACCEPTABLE trusted/complete/safe-quarantined/0
  //   hold-for-retrain-fully-validated-marked-weakgate-*        ACCEPTABLE trusted/complete/safe-quarantined/0
  //   hold-for-retrain-fully-validated-weakgate-*               ACCEPTABLE trusted/complete/safe-quarantined/0
  //     (DEFAULT-VALUE PATH COMPLETENESS case: promotionGateMode and
  //     distrustMarking both left untouched — the exact regression
  //     class the batch brief requires auditing)
  //   hold-for-retrain-draining-validated                      ACCEPTABLE quarantined/complete/safe-quarantined/0
  //   hold-for-retrain-draining-skip-datacheck                 ACCEPTABLE quarantined/complete/safe-quarantined/0
  //   hold-for-retrain-just-engaged-pre-sustained               ACCEPTABLE quarantined/complete/safe-quarantined/0
  //     (closes the pre-sustainedExposure gap: a candidate who
  //     quarantines + commits to hold-for-retrain BEFORE the
  //     sustainedExposure threshold fires must not fall through to
  //     healthy-default and read as "nothing happened yet")
  //   hold-for-retrain-just-engaged                            ACCEPTABLE quarantined/complete/safe-quarantined/0
  //   quarantined-no-rollback-target                           ACCEPTABLE quarantined/complete/safe-quarantined/0
  //
  // Every UNSAFE state fails successCondition for a real, named
  // reason: either currentServingArtifactTrustStatus ===
  // "corrupted-serving" (an actively-happening correctness violation —
  // never acceptable regardless of how healthy infrastructure looks),
  // or lineageAuditStatus === "compromised" (a permanent forensic-
  // record violation), or artifactRiskStatus is neither "healthy" nor
  // a safe-quarantined variant. None of this is "almost fixed by
  // coincidence of rounding" — each fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // every safe-quarantined state ───────────────────────────────────────
  // Every one of these states has currentServingArtifactTrustStatus !==
  // "corrupted-serving" and lineageAuditStatus === "complete" — no
  // corrupted output has EVER reached production traffic after
  // quarantine, and the forensic record is fully intact in every one of
  // them. This is the scenario's required legitimate degraded-but-safe
  // tradeoff: the gate/marking loop is not yet fully closed, or nothing
  // at full confidence is serving yet (mid-retrain), or no rollback
  // target was ever chosen — exactly the judgment call a Principal
  // engineer is expected to make and be willing to hand back.
  //
  // ── Why lineage-destroyed is UNSAFE regardless of live serving state
  // (business invariant #3's binding requirement) ─────────────────────
  // lineageAuditStatus === "compromised" fails successCondition's and
  // acceptableCondition's explicit lineageAuditStatus === "complete"
  // check directly, regardless of currentServingArtifactTrustStatus
  // reading "quarantined" (identical to every genuinely safe state).
  // This scenario can therefore never resolve as safe via this path, in
  // any tier, however long the candidate waits or however good the
  // other fields look.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // rollback-last-known-good-full's live
  // values.cumulativeDecisionsOnCorruptedModel authors 0 (the live
  // field answers "is a corrupted decision happening RIGHT NOW"), but
  // if this attempt ever passed through the keep-serving family first,
  // state.peaks.peakValues.cumulativeDecisionsOnCorruptedModel
  // (trackPeak:true, computed generically by the engine as Math.max
  // every tick) remains permanently nonzero for the rest of the attempt
  // — never reset by reaching a clean rule state.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "safe-quarantined" (ACCEPTABLE — a deliberate,
  // genuinely safe but not-yet-fully-closed-loop tradeoff) and "fully
  // recovered" (OPTIMAL) is a real system-state distinction, but
  // deciding WHETHER to accept that bounded gap — as opposed to
  // continuing to harden the promotion gate, mark distrust explicitly,
  // or wait for a full retrain-and-validate cycle — is a genuine
  // Principal-level judgment call, not something the engine should
  // auto-resolve the instant a threshold is crossed.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is corrupted-serving-active
  // (currentServingArtifactTrustStatus "corrupted-serving",
  // artifactRiskStatus "corrupted-exposure"), which satisfies neither
  // successCondition nor acceptableCondition.
  // evaluateCandidateDeclaredFinish therefore returns outcome:
  // "declared_unstable" — the expected default, especially important
  // here since every live infrastructure metric already reads green at
  // this exact moment (the scenario's core product claim: the artifact
  // trains successfully, passes basic health checks, and could be
  // deployed without a single infrastructure error occurring anywhere).
  completion: { mode: "candidate_declared", acceptableCondition },
};
