import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { leakRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  MANUAL_RESTART_TRIGGERED_KEY,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
  CACHE_EVICTION_POLICY_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const memoryLeakSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "serviceStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Memory pressure has reached a critical level.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Memory pressure has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "memoryUsageMb",
      trackPeak: true,
      threshold: {
        value: 1_500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Memory usage has crossed 1,500 MB.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Memory usage has dropped back below 1,500 MB.",
      },
    },
  ],
  timedEvents,
  rules: leakRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
