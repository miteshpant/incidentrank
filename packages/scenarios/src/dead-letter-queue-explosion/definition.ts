import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { deadLetterQueueExplosionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  REPLAY_PAUSED_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  RETRY_DELAY_MS_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  CONSUMER_INSTANCE_COUNT_KEY,
  DLQ_ACTION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const deadLetterQueueExplosionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "consumerStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The consumer fleet has entered a critical backlog/error state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The consumer fleet has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dlqDepth",
      trackPeak: true,
    },
    {
      key: "duplicateProcessingRiskScore",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Duplicate-processing risk has crossed 50 — replay is racing live traffic.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Duplicate-processing risk has dropped back below 50.",
      },
    },
    {
      key: "mainQueueLagMessages",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: deadLetterQueueExplosionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   dlq-growing (baseline)                    UNSAFE   lag=520, critical
  //   backlog-catchup (second wave, no fix)      UNSAFE   lag=1400, critical
  //   scaled-consumers-worsened (harmful)        UNSAFE   lag=980, critical
  //   unfiltered-replay-risk (harmful)           UNSAFE   dupRisk=78, warning
  //   replay-paused-backlog-growing (partial)    UNSAFE   dlqGrowth=260
  //   dlq-discarded (THE TRAP)                   UNSAFE   every operational
  //                                               metric clean (lag=15,
  //                                               dupRisk=0, normal) BUT
  //                                               dataLossState=
  //                                               "eventsPurged" — a
  //                                               real, ongoing
  //                                               correctness violation
  //                                               (irreversible data
  //                                               loss) that must never
  //                                               be treated as safe to
  //                                               hand back, regardless
  //                                               of how healthy
  //                                               everything else
  //                                               reads. Both
  //                                               successCondition and
  //                                               acceptableCondition
  //                                               explicitly gate on
  //                                               dataLossState !==
  //                                               "eventsPurged" for
  //                                               exactly this reason —
  //                                               see revenue-and-cost.ts.
  //   recovered-replay-paused (parser fixed,     ACCEPTABLE  dlqDepth=640
  //     replay paused)                            (backlog undrained)
  //                                               but dupRisk=0, no new
  //                                               failures, nothing
  //                                               lost — a genuinely
  //                                               safe, deliberately
  //                                               incomplete handback.
  //   recovered-fixed (parser fixed, filtered    OPTIMAL  everything
  //     disciplined replay)                       clean, backlog
  //                                               actually drained,
  //                                               dataLossState=
  //                                               "intact".
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (fully drained vs. safely parked), and one state
  // that LOOKS safe on every operational metric is in fact the
  // scenario's unsafe trap — exactly the "is this system safe enough to
  // hand back" judgment candidate_declared exists to test, per section
  // 8's rule. An objective, purely time/metric-driven automatic
  // resolution cannot express this distinction, because the discarded
  // state's operational metrics are indistinguishable from a real
  // recovery without also checking dataLossState.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // replay-paused-safe-handback state. The remaining unsafe states
  // (unfiltered replay, scaled consumers, replay-paused-but-parser-
  // broken, baseline, second wave) are real but incomplete or actively
  // harmful mitigations that never cross either bar — correctly left
  // ineligible for Finish, not awarded a third tier, per section 9's
  // "not almost passed, not partial credit" rule.
  completion: { mode: "candidate_declared", acceptableCondition },
};
