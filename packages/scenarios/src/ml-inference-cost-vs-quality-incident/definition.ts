import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { mlInferenceCostVsQualityIncidentRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const mlInferenceCostVsQualityIncidentSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Decision-QUALITY-RISK severity, deliberately independent of
      // Routing Layer/Large Model/Small Model componentHealth (which
      // never leaves "healthy" anywhere in this scenario — see
      // rules.ts). This is what drives reliability's criticalTimeRatio
      // measure in scoring.ts: time spent with quality-critical traffic
      // genuinely at risk of silent downgrade, never time spent with
      // serving itself unavailable.
      key: "qualityRiskSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: quality-critical requests are now being silently served by the Small Model with no explicit policy sanctioning it.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: quality-critical requests are no longer being silently downgraded.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/CUMULATIVE business-risk exposure (phase6e3.md's
      // binding requirement). trackPeak:true is what makes this
      // genuinely non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate switches away from an unsafe routing policy and
      // values.cumulativeSilentCriticalDowngradeCount returns to 0, the
      // peak the attempt actually reached stays recorded.
      key: "cumulativeSilentCriticalDowngradeCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: a quality-critical request has been silently served by the Small Model at least once during this incident — a permanent exposure that will not be erased by any later policy change.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further quality-critical requests are currently being silently downgraded.",
      },
    },
    {
      key: "monthlyInferenceCostUsd",
      trackPeak: true,
    },
    {
      key: "averageResponseQualityScore",
      trackPeak: false,
    },
    {
      key: "criticalTrafficSilentlyDowngradedPercent",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: quality-critical requests are currently being silently downgraded.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Quality-critical requests are no longer being silently downgraded.",
      },
    },
  ],
  timedEvents,
  rules: mlInferenceCostVsQualityIncidentRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e3.md, same style/rigor as the
  // Phase 6E.1/6E.2 siblings) ─────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (criticalTrafficSilentlyDowngradedPercent /
  // safetyBasis / costStatus / monthlyInferenceCostUsd /
  // cumulativeSilentCriticalDowngradeCount):
  //
  //   healthy-default                             N/A (pre-incident)
  //   baseline-active-misroute                     UNSAFE(cost)  0/unaddressed/cost-explosive/7200/0
  //   baseline-sustained-misroute                   UNSAFE(cost)  0/unaddressed/cost-explosive/12600/0
  //     (quality is never actually downgraded here — the classifier
  //     still routes SOMEWHERE, just expensively — so this is a real,
  //     unaddressed COST exposure, never a correctness trap; safetyBasis
  //     "unaddressed" is what keeps a zero-action attempt from passing
  //     either Finish tier merely because nothing visible has gone
  //     wrong yet)
  //   blanket-small-model-unprotected-active        UNSAFE  100/unaddressed/cost-contained/900/90
  //   blanket-small-model-unprotected-sustained      UNSAFE  100/unaddressed/cost-contained/900/540
  //     (cheapest inference spend of ANY reachable state in the ENTIRE
  //     scenario — the required unsafe-minimum-cost trap; see the
  //     score-sanity audit below)
  //   blanket-small-model-protected                 ACCEPTABLE 0/deliberate-protection/cost-contained/2650/0
  //   quality-tiering-standard                       OPTIMAL 0/deliberate-protection/cost-contained/3050/0
  //   quality-tiering-standard-cache                  OPTIMAL 0/deliberate-protection/cost-contained/2550/0
  //   quality-tiering-enhanced                        OPTIMAL 0/deliberate-protection/cost-contained/3550/0
  //   quality-tiering-enhanced-cache                   OPTIMAL 0/deliberate-protection/cost-contained/3050/0
  //   classifier-fix-unprotected-just-dispatched       UNSAFE  32/unaddressed/cost-explosive/7200/30
  //   classifier-fix-unprotected-window1               UNSAFE  18/unaddressed/cost-explosive/5600/140
  //   classifier-fix-protected-rollout                ACCEPTABLE 0/deliberate-protection/cost-explosive/5400/0
  //   classifier-fix-fully-rolled-out                  OPTIMAL 0/deliberate-protection/cost-contained/3200/0
  //   blanket-large-model-sustained                    ACCEPTABLE 0/deliberate-protection/cost-explosive/14500/0
  //
  // Every UNSAFE state fails successCondition for a real, named
  // reason: either criticalTrafficSilentlyDowngradedPercent > 0 (an
  // actively-happening quality-critical downgrade violation — never
  // acceptable regardless of how cheap or fast serving looks), or
  // costStatus reads "cost-explosive" (a real, unaddressed cost
  // exposure with no correctness violation). None of this is "almost
  // fixed by coincidence of rounding" — each fails a real, named gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is the correct tier for
  // blanket-large-model, blanket-small-model-protected, and
  // classifier-fix-protected-rollout ───────────────────────────────────
  // Every one of these states has criticalTrafficSilentlyDowngradedPercent
  // === 0 and qualityProtectionStatus === "protected" — no quality-
  // critical request has EVER been silently downgraded in any of them.
  // This is the scenario's required legitimate degraded-but-safe
  // tradeoff: quality fully protected, cost containment either not yet
  // achieved (protected-rollout, still draining) or never pursued at all
  // (blanket-large-model) — exactly the judgment call a Principal
  // engineer is expected to make and be willing to hand back, distinct
  // from OPTIMAL (both quality protected AND cost genuinely contained).
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "protected but cost-explosive" (ACCEPTABLE) and
  // "protected and cost-contained" (OPTIMAL) is a real system-state
  // distinction, but deciding WHETHER to accept blanket-large-model's
  // zero-risk-zero-savings tradeoff, or to wait out a classifier fix's
  // rollout, or to actively maintain an explicit quality-tiering policy,
  // is a genuine Principal-level judgment call, not something the
  // engine should auto-resolve the instant a threshold is crossed. This
  // mirrors every other Phase 6E candidate_declared sibling's
  // completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is baseline-active-misroute
  // (criticalTrafficSilentlyDowngradedPercent 0, costStatus
  // "cost-explosive", safetyBasis "unaddressed"). This fails BOTH
  // successCondition (costStatus != "cost-contained", safetyBasis !=
  // "deliberate-protection") AND acceptableCondition (safetyBasis !=
  // "deliberate-protection") — the safetyBasis gate (see
  // revenue-and-cost.ts's doc comment) is exactly what prevents a
  // zero-action attempt from passing Finish merely because the degraded
  // classifier has not yet produced a visible downgrade.
  // evaluateCandidateDeclaredFinish therefore returns outcome:
  // "declared_unstable" — the expected default, especially important
  // here since monthlyInferenceCostUsd is already visibly elevated at
  // this exact moment, but nothing about availability signals it.
  completion: { mode: "candidate_declared", acceptableCondition },
};
