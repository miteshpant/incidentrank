import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { cascadeRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cascadingServiceFailureSimulation: ScenarioSimulationDefinition = {
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
        enteringMessage: "The service chain has entered a critical cascading-failure state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The service chain has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "cascadeDepth",
      trackPeak: true,
      threshold: {
        value: 3,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The cascade has spread to 3 or more services.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The cascade has receded below 3 services.",
      },
    },
    {
      key: "aggregateQueueDepth",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: cascadeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
