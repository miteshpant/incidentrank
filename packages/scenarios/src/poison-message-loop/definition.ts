import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { poisonMessageRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  MAX_RETRY_ATTEMPTS_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  CONSUMER_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const poisonMessageLoopSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "queueStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The message queue has entered a critical retry-loop state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The message queue has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "healthyMessageBacklog",
      trackPeak: true,
      threshold: {
        value: 500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The healthy message backlog has crossed 500 messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The healthy message backlog has dropped back below 500 messages.",
      },
    },
    {
      key: "retryLoopCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: poisonMessageRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
