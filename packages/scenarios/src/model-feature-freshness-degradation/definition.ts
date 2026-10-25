import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { modelFeatureFreshnessDegradationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CRITICAL_DECISION_HOLD_KEY,
  FEATURE_FALLBACK_MODE_KEY,
  FEATURE_REFRESH_POLICY_KEY,
  MODEL_QUALITY_TIER_KEY,
  MODEL_ROUTING_KEY,
  OFFLINE_SNAPSHOT_USE_KEY,
  PIPELINE_PRIORITY_KEY,
  STALE_FEATURE_CUTOFF_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const modelFeatureFreshnessDegradationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Decision-QUALITY severity, deliberately independent of Model
      // Serving/Decision API componentHealth (which never leaves
      // "healthy" anywhere in this scenario — see rules.ts). This is
      // what drives reliability's criticalTimeRatio measure in
      // scoring.ts: time spent with decision quality genuinely at
      // risk, never time spent with serving itself unavailable.
      key: "decisionQualitySeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: critical decisions are now being computed from features past the authored staleness bound.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: critical decisions are no longer being computed from stale features.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/CUMULATIVE business-risk exposure (phase6e2.md's
      // binding requirement). trackPeak:true is what makes this
      // genuinely non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate reverts the unsafe lever and
      // values.cumulativeStaleCriticalDecisionCount returns to 0, the
      // peak the attempt actually reached stays recorded and is what
      // scoring reads indirectly via the dataIntegrity/reliability
      // penalties on the string-state fields this count tracks
      // alongside.
      key: "cumulativeStaleCriticalDecisionCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: a critical decision has been computed from features past the staleness bound at least once during this incident — a permanent exposure that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further critical decisions are currently being computed from stale features.",
      },
    },
    {
      key: "decisionQualityScore",
      trackPeak: false,
    },
    {
      key: "featureFreshnessAgeSeconds",
      trackPeak: true,
    },
    {
      key: "staleFeaturePercentOnCriticalDecisions",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: critical decisions are currently being served from stale features.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Critical decisions are no longer being served from stale features.",
      },
    },
  ],
  timedEvents,
  rules: modelFeatureFreshnessDegradationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e2.md section 16, same style/rigor
  // as the Phase 6E.1 siblings) ────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (decisionQualityScore / staleFeaturePercentOnCritical
  // Decisions / freshnessStatus / decisionRiskStatus /
  // cumulativeStaleCriticalDecisionCount):
  //
  //   healthy-default                             N/A (pre-incident)
  //   baseline-lagging                            UNSAFE  68/32/critical-at-risk/quality-compromised/70
  //   baseline-sustained-lagging                   UNSAFE  42/58/critical-at-risk/quality-compromised/310
  //   silent-permissive-active                     UNSAFE  62/32/critical-at-risk/quality-compromised-silent/90
  //   silent-permissive-sustained                  UNSAFE  38/60/critical-at-risk/quality-compromised-silent/420
  //     (best-looking serving numbers in the ENTIRE scenario —
  //     modelServingUptimePercent/decisionApiP99LatencyMs identical to
  //     every safe path — yet the single worst dataIntegrity/
  //     reliability outcome; see the score-sanity audit below)
  //   offline-snapshot-critical-trap               UNSAFE  45/48/critical-at-risk/quality-compromised-silent/340
  //     (an INDEPENDENT unsafe lever, not reachable only via permissive
  //     fallback mode)
  //   fresh-fallback-full-quality                  OPTIMAL-eligible* 88/0/fresh/safe-degraded/0
  //   fresh-fallback-lightweight                   OPTIMAL-eligible* 76/0/fresh/safe-degraded/0
  //     (*both satisfy acceptableCondition immediately — see below;
  //     neither individually satisfies successCondition's >=85
  //     decisionQualityScore bar for "lightweight", only "full" does —
  //     see the alternate-path audit)
  //   held-just-engaged                            ACCEPTABLE 70/0/fresh/safe-degraded/0
  //   draining-window1-held-balanced                ACCEPTABLE 78/0/fresh/safe-degraded/0
  //   draining-window1-held-prioritized             ACCEPTABLE 84/0/fresh/safe-degraded/0
  //   draining-window2-held-balanced                ACCEPTABLE 88/0/fresh/safe-degraded/0
  //   draining-window2-held-prioritized             ACCEPTABLE 92/0/fresh/safe-degraded/0
  //   bounded-protective-default-no-hold            ACCEPTABLE 73/0/fresh/safe-degraded/0
  //   fully-recovered-held-prioritized              OPTIMAL 99/0/fresh/healthy/0
  //   fully-recovered-held-balanced                 OPTIMAL 95/0/fresh/healthy/0
  //     (same trigger gate as fully-recovered-held-prioritized —
  //     drainWindowFullyRecoveredElapsed is independent of
  //     pipelinePriority — but pipelinePriority stays "balanced"
  //     (the default) instead of "critical-features-first". Without
  //     this rule, bounded+hold=true+balanced run past the full
  //     recovery window fell through every pipelinePriority-gated rule
  //     below to baseline-sustained-lagging, silently re-flagging a
  //     genuinely safe, fully-drained state as the worst unmitigated
  //     baseline purely from elapsed time.)
  //
  // Every UNSAFE state fails successCondition for a real, named
  // reason: either decisionQualityScore < 85, or
  // staleFeaturePercentOnCriticalDecisions > 0 (an actively-happening
  // decision-quality violation — never acceptable regardless of how
  // healthy serving looks, per section 11's binding scoring-
  // interpretation requirement), or freshnessStatus != "fresh"
  // (decisionRiskStatus reads either "quality-compromised" — the
  // honestly-flagged baseline — or "quality-compromised-silent" — the
  // silent-permissive/offline-snapshot traps; both fail the same gate).
  // None of this is "almost fixed by coincidence of rounding" — each
  // fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // the held/bounded family and the fresh-fallback family ─────────────
  // Every one of these states has staleFeaturePercentOnCriticalDecisions
  // === 0 and decisionRiskStatus === "safe-degraded" — no critical
  // decision has EVER been computed from stale data in any of them.
  // This is the scenario's required legitimate degraded-but-safe
  // tradeoff (phase6e2.md's explicit encouragement): a bounded fallback
  // model, or a bounded hold on critical decisions only, while the
  // Feature Pipeline is still behind — exactly the judgment call a
  // Principal engineer is expected to make and be willing to hand back.
  //
  // ── Why fresh-fallback-full-quality (decisionQualityScore 88) already
  // satisfies successCondition's literal >=85 bar, yet is listed as
  // "OPTIMAL-eligible" rather than bare OPTIMAL above ───────────────────
  // It does genuinely satisfy successCondition (decisionQualityScore 88
  // >= 85, staleFeaturePercentOnCriticalDecisions 0, freshnessStatus
  // "fresh", decisionRiskStatus != "quality-compromised") — this is a
  // real, immediate OPTIMAL-tier path (Alternate Strong Path A), not
  // merely acceptable. fresh-fallback-lightweight (76) does NOT clear
  // the 85 bar on its own and lands at ACCEPTABLE instead — an honest,
  // real quality/cost distinction WITHIN the same alternate path, not a
  // forced tie. See the Scoring/alternate-paths test suite for the
  // exact tier each one reaches.
  //
  // ── Why silent-permissive/offline-snapshot are UNSAFE regardless of
  // how healthy serving looks (section 11's binding requirement) ───────
  // decisionRiskStatus === "quality-compromised-silent" (and the
  // honestly-flagged baseline's "quality-compromised") both fail
  // successCondition's explicit freshnessStatus === "fresh" check and
  // acceptableCondition's explicit decisionRiskStatus === "safe-degraded"
  // check — directly, regardless of modelServingUptimePercent/
  // decisionApiP99LatencyMs reading identically to every safe path. This
  // scenario can therefore never resolve as safe via either path, in any
  // tier, however long the candidate waits or however good serving looks.
  // If left active long enough (cumulativeStaleCriticalDecisionCount >=
  // 400, sustained 30s — reachable via silent-permissive-sustained's
  // 420), the automatic failureCondition fires — failure
  // is never gated by completion mode (tick.ts), so a candidate cannot
  // simply decline to Finish and wait out a live, worsening exposure.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // fully-recovered-held-prioritized's live
  // values.cumulativeStaleCriticalDecisionCount authors 0 (the live
  // field answers "is a stale critical decision happening RIGHT NOW"),
  // but if this attempt ever passed through the silent-permissive or
  // offline-snapshot family first, state.peaks.peakValues.
  // cumulativeStaleCriticalDecisionCount (trackPeak:true, computed
  // generically by the engine as Math.max every tick) remains
  // permanently nonzero for the rest of the attempt — never reset by
  // reaching a clean rule state.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "safe-degraded" (ACCEPTABLE — a deliberate,
  // genuinely safe tradeoff) and "fully recovered" (OPTIMAL) is a real
  // system-state distinction, but deciding WHETHER that bounded
  // tradeoff is worth its cost/accuracy impact — as opposed to
  // continuing to wait for the Feature Pipeline to fully drain, or
  // paying for aggressive refresh to speed it up — is a genuine
  // Principal-level judgment call, not something the engine should
  // auto-resolve the instant a threshold is crossed. This mirrors every
  // other Phase 6E candidate_declared sibling's completion-mode
  // reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is baseline-lagging (decisionQualityScore
  // 68, staleFeaturePercentOnCriticalDecisions 32, decisionRiskStatus
  // "quality-compromised"), which satisfies neither successCondition
  // (decisionQualityScore 68 < 85, stale% 32 != 0) nor
  // acceptableCondition (decisionRiskStatus != "safe-degraded").
  // evaluateCandidateDeclaredFinish therefore returns
  // outcome: "declared_unstable" — the expected default, especially
  // important here since every live serving metric already reads green
  // at this exact moment (phase6e2.md requirement 10's binding
  // no-outage/proactive-scenario concern).
  completion: { mode: "candidate_declared", acceptableCondition },
};
