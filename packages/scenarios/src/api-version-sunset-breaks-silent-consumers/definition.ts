import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { sunsetRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  ENABLE_COMPATIBILITY_SHIM_KEY,
  FORCE_HARD_CUTOVER_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const apiVersionSunsetBreaksSilentConsumersSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    { key: "unregisteredV1CallerCount", trackPeak: true },
    { key: "orderCreationFailureRatePercent", trackPeak: true },
    {
      key: "supportTicketBacklogCount",
      trackPeak: true,
      threshold: {
        value: 60,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Support ticket backlog has crossed 60 open tickets.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Support ticket backlog has dropped back below 60 open tickets.",
      },
    },
  ],
  timedEvents,
  rules: sunsetRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
