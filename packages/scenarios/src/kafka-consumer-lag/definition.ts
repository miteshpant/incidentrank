import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { lagRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export { CONSUMER_INSTANCES_KEY, MAX_POLL_RECORDS_KEY, AUTO_COMMIT_ENABLED_KEY } from "./controls";

const TICK_MS = 1_000;

export const kafkaConsumerLagSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "consumerStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The consumer group has entered a critical lag state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The consumer group has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "consumerLagMessages",
      trackPeak: true,
      threshold: {
        value: 5_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Consumer lag has crossed 5,000 messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Consumer lag has dropped back below 5,000 messages.",
      },
    },
    {
      key: "deadLetterCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: lagRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
