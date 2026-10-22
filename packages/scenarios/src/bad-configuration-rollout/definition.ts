import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { badConfigRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  API_SERVICE_INSTANCES_KEY,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const badConfigurationRolloutSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "configStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The API service has entered a critical state due to a bad configuration push.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The configuration issue has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "requestRejectionRate",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Request rejection rate has crossed 50%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Request rejection rate has dropped back below 50%.",
      },
    },
    {
      key: "affectedUserCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: badConfigRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
