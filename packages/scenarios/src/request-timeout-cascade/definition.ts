import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { requestTimeoutCascadeRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const requestTimeoutCascadeSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "chainStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The request chain has entered a critical in-flight-accumulation state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The request chain has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "customerSuccessRatePercent",
      trackPeak: false,
    },
    {
      key: "inFlightRequests",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "In-flight requests have crossed 300.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "In-flight requests have dropped back below 300.",
      },
    },
    {
      key: "connectionUtilizationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Connection utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Connection utilization has dropped back below 90%.",
      },
    },
    {
      key: "abandonedInFlightRequests",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: requestTimeoutCascadeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   accumulating (baseline, no mitigation)               UNSAFE
  //     successRate=22, critical
  //   saturated (second wave, no fix)                       UNSAFE
  //     successRate=9, critical
  //   retry-multiplied (retries raised, harmful)            UNSAFE
  //     successRate=8, critical
  //   inner-hop-fixed-alone (B->Dep fixed, rest untouched)  UNSAFE
  //     successRate=34, critical
  //   cancellation-on-budget-misaligned (cancel on, budget  UNSAFE
  //     untouched)                                          successRate=61,
  //                                                          critical
  //   budgeted-but-accumulating (budget fixed,              UNSAFE
  //     cancellation off — the scenario's central           successRate=52,
  //     distinguishing state)                                critical
  //   fenced (circuit breaker tripped)                       ACCEPTABLE
  //     successRate=89, warning (not critical),
  //     timeoutBudgetHealth="fenced" — the Dependency is
  //     fenced off, not fixed.
  //   recovered-rebudgeted (budget re-proportioned           OPTIMAL
  //     end-to-end AND cancellation enabled)                successRate=97,
  //                                                          normal,
  //                                                          timeoutBudgetHealth=
  //                                                          "rebudgeted" —
  //                                                          the real fix.
  //
  // Every partial/single-half-fixed state is a genuine, visible
  // improvement over raw baseline on SOME metric, but none of them
  // crosses either bar — they stay correctly ineligible for Finish
  // rather than being awarded a third tier, per section 9's explicit
  // "not almost passed, not partial credit" rule. Two states reach
  // genuine, sustained-safe stability through visibly different means
  // (re-proportioned budget + cancellation vs. fencing the Dependency off
  // entirely), which is a legitimate candidate for an acceptableCondition
  // tier per section 9's standard.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // fenced state. "Did customerSuccessRatePercent happen to climb above
  // some number" is not, by itself, proof the system is safe to hand
  // back — the candidate must judge whether the recovery came from
  // actually re-proportioning the budget and enabling cancellation, or
  // from simply refusing to call the Dependency anymore, which is exactly
  // the "is this safe enough to hand back" judgment candidate_declared
  // exists to test.
  //
  // Immediate-Finish audit: at t=0 (before the Dependency's blip even
  // fires), chainStatus is "normal" and customerSuccessRatePercent is
  // 100, but timeoutBudgetHealth is "unresolved" (never "rebudgeted" or
  // "fenced") — so successCondition and acceptableCondition are both
  // unmet from the very first tick, regardless of sustainedSeconds. A
  // zero-action immediate Finish is never eligible; the two tiers are
  // reachable only via an authored rule that is itself gated on the
  // dependencyBlip trigger (which doesn't fire until
  // DEPENDENCY_BLIP_MS), so no amount of pre-incident waiting can forge
  // eligibility, and sustainedSeconds=30 additionally requires the
  // accepted tier's condition to hold continuously for a real,
  // meaningful interval once a genuine mitigation is in place.
  completion: { mode: "candidate_declared", acceptableCondition },
};
