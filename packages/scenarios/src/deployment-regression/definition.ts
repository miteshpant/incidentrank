import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { regressionRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const deploymentRegressionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "deployStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The new deploy has entered a critical regression state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The deployment regression has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "errorRate",
      trackPeak: true,
      threshold: {
        value: 5,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Error rate has crossed 5%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Error rate has dropped back below 5%.",
      },
    },
    {
      key: "memoryUsageMb",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: regressionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
