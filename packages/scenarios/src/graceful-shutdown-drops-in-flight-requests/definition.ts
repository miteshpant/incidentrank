import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { shutdownDropRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  DEPLOY_STRATEGY_KEY,
  REPLICA_COUNT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const gracefulShutdownDropsInFlightRequestsSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "podTerminationGraceExceededCount",
      trackPeak: true,
      threshold: {
        value: 30,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Pods killed before drain completed has crossed 30.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Pods killed before drain completed has dropped back below 30.",
      },
    },
    { key: "droppedRequestsPerDeploy", trackPeak: true },
    { key: "checkoutErrorRate", trackPeak: true },
  ],
  timedEvents,
  rules: shutdownDropRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
