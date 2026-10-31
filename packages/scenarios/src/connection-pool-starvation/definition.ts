import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { starvationRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_TRAFFIC_GRAPHS_KEY,
  INSPECT_POOL_CONFIG_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
  DB_POOL_MAX_SIZE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const connectionPoolStarvationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "poolUtilizationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Connection pool utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Connection pool utilization has dropped back below 90%.",
      },
    },
    { key: "requestLatencyMs", trackPeak: true },
    { key: "poolWaitQueueDepth", trackPeak: true },
  ],
  timedEvents,
  rules: starvationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
