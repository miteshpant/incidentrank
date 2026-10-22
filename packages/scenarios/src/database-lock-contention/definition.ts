import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { contentionRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BATCH_JOB_CONCURRENCY_KEY,
  BATCH_JOB_CHUNK_SIZE_KEY,
  LOCK_TIMEOUT_MS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const databaseLockContentionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "lockStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The primary database has entered a critical lock-contention state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Lock contention has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "blockedTransactions",
      trackPeak: true,
      threshold: {
        value: 100,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Blocked transactions have crossed 100.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Blocked transactions have dropped back below 100.",
      },
    },
    {
      key: "timedOutTransactions",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: contentionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
