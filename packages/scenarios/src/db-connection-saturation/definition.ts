import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { saturationRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export { POOL_SIZE_KEY, QUERY_TIMEOUT_MS_KEY, READ_REPLICA_ENABLED_KEY } from "./controls";

const TICK_MS = 1_000;

export const dbConnectionSaturationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "dbStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Database connection pool has saturated.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Database connection pool has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "connectionUsage",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Connection usage has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Connection usage has dropped back below 90%.",
      },
    },
    {
      key: "queuedConnections",
      trackPeak: true,
      threshold: {
        value: 200,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The connection queue has crossed 200 pending requests.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The connection queue has dropped back below 200 pending requests.",
      },
    },
  ],
  timedEvents,
  rules: saturationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
