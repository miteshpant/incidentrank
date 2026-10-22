import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { herdRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CLIENT_JITTER_ENABLED_KEY,
  API_GATEWAY_INSTANCES_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const thunderingHerdSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "gatewayStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The API gateway has entered a critical overload state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The API gateway has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "rejectedRequestCount",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Rejected requests have crossed 300.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Rejected requests have dropped back below 300.",
      },
    },
    {
      key: "requestsPerSecond",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: herdRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
