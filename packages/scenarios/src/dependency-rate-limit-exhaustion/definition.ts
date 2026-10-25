import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dependencyRateLimitExhaustionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHING_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const dependencyRateLimitExhaustionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "quotaStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The dependency's rolling-window quota has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The dependency's quota has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dependency429RatePerMin",
      trackPeak: true,
      threshold: {
        value: 100,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Dependency 429 rate has crossed 100/min.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Dependency 429 rate has dropped back below 100/min.",
      },
    },
    {
      key: "quotaRemainingPct",
      trackPeak: false,
    },
    {
      key: "retryVolumePerMin",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: dependencyRateLimitExhaustionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ───────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   quota-drawing-down (pre-429 warning)        UNSAFE   quotaStatus=
  //                                                 warning, no bar met
  //   provider-throttling (baseline, post-429)    UNSAFE   quotaStatus=
  //                                                 critical
  //   retry-accelerated-exhaustion (the trap)     UNSAFE   quotaStatus=
  //                                                 critical, quotaRemainingPct=0,
  //                                                 heads toward automatic
  //                                                 failure
  //   capped-concurrency-partial                  UNSAFE   quotaStatus=
  //                                                 warning, incomplete
  //   feature-suppressed                          ACCEPTABLE  quotaStatus=
  //                                                 normal, 429=0, but
  //                                                 quotaOutcome=
  //                                                 "feature-suppressed" —
  //                                                 relief came from
  //                                                 turning a feature off,
  //                                                 not from a durable
  //                                                 reduction in call volume.
  //   sustained-under-quota-caching                OPTIMAL  quotaStatus=
  //                                                 normal, 429=0,
  //                                                 quotaOutcome=
  //                                                 "sustained-under-quota"
  //   sustained-under-quota-priority                OPTIMAL  same outcome,
  //                                                 reached via shedding
  //                                                 low-priority traffic
  //                                                 instead of caching.
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (durable volume reduction vs. feature removal), so
  // this is a legitimate candidate for an acceptableCondition tier per
  // section 10's standard. The remaining states (capped-concurrency
  // partial relief, the pre-/post-429 baselines) are real but incomplete
  // — they never cross either bar and are correctly left ineligible for
  // Finish, not awarded a third tier.
  //
  // Immediate-Finish audit: the pre-incident "healthy" default state
  // has quotaStatus="normal" and dependency429RatePerMin=0, which could
  // superficially look success-like, but quotaOutcome stays
  // "unresolved" until a rule actually matches a genuine mitigation —
  // it never equals "sustained-under-quota" or "feature-suppressed" at
  // t=0 or at any point before the candidate acts. A zero-action
  // immediate Finish is therefore never eligible, with or without the
  // incident having started. Both successCondition and
  // acceptableCondition additionally require 30 seconds of sustained
  // stability (chosen from this scenario's own timing scale: the quota
  // window is 10 minutes, throttling begins 4.5 minutes in, and a real
  // mitigation's relief is visible immediately but must hold, not spike
  // once) before Finish becomes eligible at all — waiting/observation
  // alone, with no mitigating action, can never reach either bar,
  // because quotaOutcome only changes when a rule matching a real
  // control change fires.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // feature-suppressed state. "Has the 429 rate happened to drop to
  // zero" is not, by itself, proof the system is safe to hand back —
  // the candidate must judge whether that happened because call volume
  // was durably reduced or because a feature was sacrificed, which is
  // exactly the "is this safe enough to hand back" judgment
  // candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
