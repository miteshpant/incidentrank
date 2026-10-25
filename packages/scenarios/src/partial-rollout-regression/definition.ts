import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { partialRolloutRegressionRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ROLLOUT_PERCENT_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
  REGRESSED_FEATURE_ENABLED_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  DEPENDENCY_PROTECTION_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const partialRolloutRegressionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "rolloutState",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The new version's regression has escalated to critical customer-facing impact.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The rollout has recovered to a normal state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "newVersionErrorRate",
      trackPeak: true,
      threshold: {
        value: 5,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "New version error rate has crossed 5%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "New version error rate has dropped back below 5%.",
      },
    },
    {
      key: "sharedDependencyPressure",
      trackPeak: true,
      threshold: {
        value: 80,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Shared dependency pressure has crossed 80%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Shared dependency pressure has dropped back below 80%.",
      },
    },
    { key: "newVersionMemoryUsageMb", trackPeak: true },
  ],
  timedEvents,
  rules: partialRolloutRegressionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified against
  // successCondition (customerSuccessRate >= 99, newVersionErrorRate <=
  // 1, regressionHealth === "regression-removed"):
  //
  //   healthy (pre-incident)                  —        success=99.7/err=0.3/
  //                                                     regressionHealth=
  //                                                     "unresolved" — fails
  //                                                     on regressionHealth;
  //                                                     see immediate-Finish
  //                                                     audit below.
  //   regressing (baseline)             UNSAFE  success=94.1, err=8.4,
  //                                             regressionHealth=unresolved
  //   scaled-contention (harmful)       UNSAFE  success=91.5, err=9.8,
  //                                             regressionHealth=unresolved
  //   dependency-protected (masked)     UNSAFE  success=95.8, err=6.2,
  //                                             regressionHealth=masked
  //   dependency-rate-limited (masked)  UNSAFE  success=93.4, err=7.5,
  //                                             regressionHealth=masked
  //   isolated-pool-contained (masked)  UNSAFE  success=94.6, err=11.2,
  //                                             regressionHealth=unresolved
  //   cross-contaminated (2nd wave)     UNSAFE  success=86.0, err=11.2,
  //                                             regressionHealth=unresolved
  //   rolled-back                       OPTIMAL success=99.7, err=0.2,
  //                                             regressionHealth=
  //                                             "regression-removed"
  //   feature-disabled                  OPTIMAL success=99.7, err=0.25,
  //                                             regressionHealth=
  //                                             "regression-removed"
  //   rollout-zeroed                     OPTIMAL success=99.7, err=0.3,
  //                                             regressionHealth=
  //                                             "regression-removed"
  //
  // Every masking/protection path (scaling, circuit breaker, rate limit,
  // isolated pool) genuinely helps something real (memory pressure,
  // dependency contamination risk) but leaves the new version's own
  // error rate well above the 1% bar and regressionHealth at "masked" or
  // "unresolved" — none of them is "almost fixed" or "close to
  // threshold"; they are durably, substantively short of safe, per
  // section 10's standard. There is therefore no genuine acceptable
  // tier: the honest line is "the regression is actually gone" vs "it
  // is not," and three independently-reachable paths (rollback,
  // feature-flag disable, rollout-zeroed) all cross that line equally
  // well — proving multiple defensible strategies exist without any of
  // them being secretly worse, while masking never crosses it at all.
  //
  // Decision: candidate_declared, with NO acceptableCondition. "Has
  // customerSuccessRate recovered" is not sufficient proof the system is
  // safe to hand back on its own — a scaled/protected/isolated path can
  // show healthy-looking dependency numbers while the new version is
  // still actively serving elevated errors to its rollout share. The
  // candidate must judge whether the regression itself was actually
  // removed (regressionHealth) or merely contained around, which is
  // exactly the judgment candidate_declared exists to test. automatic
  // mode would let the engine silently resolve on customer-facing
  // metrics alone, hiding that distinction.
  //
  // ── Immediate-Finish audit (phase6c.md section 9) ──────────────────
  //
  // At incident start (before REGRESSION_ACTIVE_MS), regressionHealth is
  // "unresolved" — not "regression-removed" — so successCondition is
  // never satisfied pre-incident, and a zero-action immediate Finish is
  // correctly ineligible (declared_unstable) both before and after the
  // trigger fires, since the candidate has made no change at all. No
  // sustainedSeconds tuning was needed to block this: the string-state
  // gate on regressionHealth, not a numeric threshold a quiet baseline
  // could accidentally cross, is what keeps "do nothing, click Finish"
  // from ever resolving. successCondition.sustainedSeconds=30 is set at
  // a realistic post-mitigation observation window (the three optimal
  // rules recover every numeric metric instantly on the same tick the
  // control is set, so 30s purely confirms the recovery holds, rather
  // than being load-bearing against a premature zero-action Finish).
  completion: { mode: "candidate_declared" },
};
