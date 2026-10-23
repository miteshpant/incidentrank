import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dependencyTimeoutCascadeRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  API_TO_A_TIMEOUT_MS_KEY,
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const dependencyTimeoutCascadeSimulation: ScenarioSimulationDefinition = {
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
        enteringMessage: "The request chain has entered a critical cascading-exhaustion state.",
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
      key: "serviceBPoolUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Service B's connection pool utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Service B's connection pool utilization has dropped back below 90%.",
      },
    },
    {
      key: "serviceCConnectionsInUse",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Service C's inbound connection usage has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Service C's inbound connection usage has dropped back below 90%.",
      },
    },
  ],
  timedEvents,
  rules: dependencyTimeoutCascadeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   cascading (baseline, no mitigation)         UNSAFE  successRate=14, critical
  //   cascading-saturated (second wave, no fix)   UNSAFE  successRate=6,  critical
  //   retry-amplified (retries raised, harmful)   UNSAFE  successRate=22, critical
  //   fail-fast-wasted-work (top-cut-alone, harmful) UNSAFE successRate=9, critical
  //   bulkhead-partial (A concurrency capped alone) UNSAFE successRate=58, critical
  //   b-fixed-a-budget-misaligned (B fixed, A untouched) UNSAFE successRate=48, critical
  //   b-relieved-c-connections-stressed (B fixed,  UNSAFE  successRate=31, critical
  //     retries still amplifying onto C's connections — the scenario's
  //     central pressure-transfer state)
  //   breaker-open (circuit breaker tripped)       ACCEPTABLE successRate=88,
  //     warning (not critical), timeoutBudgetHealth="masked" — the
  //     dependency is fenced off, not fixed.
  //   recovered-budgeted (full budget              OPTIMAL successRate=96,
  //     re-proportioned end-to-end)                        normal,
  //                                                        timeoutBudgetHealth=
  //                                                        "budgeted" — the
  //                                                        real fix.
  //
  // Every partial/retry-stress state is a genuine, visible improvement
  // over raw baseline on SOME metric, but none of them crosses either
  // bar — they stay correctly ineligible for Finish rather than being
  // awarded a third tier, per section 9's explicit "not almost passed,
  // not partial credit" rule. Two states reach genuine, sustained-safe
  // stability through visibly different means (re-proportioned budget
  // vs. fencing the dependency off entirely), which is a legitimate
  // candidate for an acceptableCondition tier per section 9's standard
  // ("optional enrichment disabled while core customer path is healthy"
  // generalizes directly to "a dependent capability fenced off while the
  // rest of the chain is healthy").
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // breaker-open state. "Did customerSuccessRatePercent happen to climb
  // above some number" is not, by itself, proof the system is safe to
  // hand back — the candidate must judge whether the recovery came from
  // actually re-proportioning the budget or from simply refusing to call
  // the slow dependency anymore, which is exactly the "is this safe
  // enough to hand back" judgment candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
