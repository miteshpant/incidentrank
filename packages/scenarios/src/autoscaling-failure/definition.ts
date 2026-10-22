import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { autoscalingRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const autoscalingFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "capacityStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The service has run out of autoscaling capacity.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Capacity has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "requestQueueDepth",
      trackPeak: true,
      threshold: {
        value: 200,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The request queue has crossed 200 pending requests.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The request queue has dropped back below 200 pending requests.",
      },
    },
    {
      key: "currentInstanceCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: autoscalingRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
