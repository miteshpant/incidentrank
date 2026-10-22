import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { skewRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  CONSUMER_INSTANCES_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const kafkaPartitionSkewSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "partitionStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The hot partition has entered a critical lag state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The hot partition has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "hotPartitionLagMessages",
      trackPeak: true,
      threshold: {
        value: 3_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Hot partition lag has crossed 3,000 messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Hot partition lag has dropped back below 3,000 messages.",
      },
    },
    {
      key: "idleConsumerCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: skewRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
