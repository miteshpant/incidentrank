import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { sessionAffinityRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_SESSION_ROUTING_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  SCALE_CACHE_CLUSTER_KEY,
  RESTART_APP_SERVERS_KEY,
  RESEED_HASH_RING_KEY,
  FORCE_SESSION_RESYNC_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const sessionAffinityLossAfterCacheFailoverSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "sessionStateInconsistencyRatePercent",
      trackPeak: true,
      threshold: {
        value: 15,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Session state inconsistency rate has crossed 15%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Session state inconsistency rate has dropped back below 15%.",
      },
    },
    { key: "sessionAffinityMismatchRatePercent", trackPeak: true },
    { key: "unexpectedLogoutRatePercent", trackPeak: true },
  ],
  timedEvents,
  rules: sessionAffinityRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
