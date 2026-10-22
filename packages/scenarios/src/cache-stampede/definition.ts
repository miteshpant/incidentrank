import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { stampedeRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHE_TTL_SECONDS_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cacheStampedeSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "cacheStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The cache layer has entered a critical stampede state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The cache stampede has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "queuedRequests",
      trackPeak: true,
      threshold: {
        value: 400,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Queued requests at the origin have crossed 400.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Queued requests at the origin have dropped back below 400.",
      },
    },
    {
      key: "originRequestRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: stampedeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
