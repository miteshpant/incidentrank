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
};
