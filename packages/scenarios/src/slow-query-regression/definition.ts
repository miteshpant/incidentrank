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
  QUERY_TIMEOUT_MS_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  CONNECTION_POOL_SIZE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const slowQueryRegressionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "queryStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Query performance has entered a critical regression state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Query performance has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "cpuUtilization",
      trackPeak: true,
      threshold: {
        value: 80,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Database CPU utilization has crossed 80%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Database CPU utilization has dropped back below 80%.",
      },
    },
    {
      key: "queuedQueries",
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
