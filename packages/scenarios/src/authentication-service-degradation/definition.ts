import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { authDegradationRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AUTH_SERVICE_INSTANCES_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const authenticationServiceDegradationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "authServiceStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The authentication service has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The authentication service has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "authServiceLatencyMs",
      trackPeak: true,
      threshold: {
        value: 1_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Auth service latency has crossed 1 second.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Auth service latency has dropped back below 1 second.",
      },
    },
    {
      key: "authFailureRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: authDegradationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Phase 6.1: candidate-declared completion — deliberately no
  // acceptableCondition. Per the state audit, there is exactly one
  // genuinely safe state (full capacity scaling, meeting
  // successCondition) and no legitimate safe-but-imperfect middle tier —
  // both partial-mitigation states (partial scaling, cache-TTL-only) are
  // still actively broken (4-6% ongoing auth failures), not a deliberate
  // tradeoff. This scenario's candidate-declared value is instead the
  // signature-verification-bypass trap: it drives authFailureRate low
  // enough to look numerically healthy while authServiceStatus goes
  // critical (a real security regression), testing whether the candidate
  // recognizes the system is NOT actually safe to hand back — "is this
  // actually safe," not a tier choice between multiple legitimate states.
  completion: { mode: "candidate_declared" },
};
