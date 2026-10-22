import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dependencyRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CIRCUIT_BREAKER_ENABLED_KEY,
  REQUEST_TIMEOUT_MS_KEY,
  FALLBACK_RESPONSE_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const downstreamDependencyFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "callingServiceStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The calling service has entered a critical capacity-exhaustion state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The calling service has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "queuedRequests",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Queued requests at the calling service have crossed 300.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Queued requests at the calling service have dropped back below 300.",
      },
    },
    {
      key: "callingServiceThreadPoolUtilization",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: dependencyRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
