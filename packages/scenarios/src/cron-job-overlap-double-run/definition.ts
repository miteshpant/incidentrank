import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { overlapRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
  CRON_INTERVAL_MINUTES_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cronJobOverlapDoubleRunSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "dailyMetricsDuplicateRowPercent",
      trackPeak: true,
      threshold: {
        value: 40,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Daily metrics duplicate row percentage has crossed 40%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Daily metrics duplicate row percentage has dropped back below 40%.",
      },
    },
    { key: "concurrentRunCount", trackPeak: true },
    { key: "dailyMetricsRowCount", trackPeak: true },
  ],
  timedEvents,
  rules: overlapRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
