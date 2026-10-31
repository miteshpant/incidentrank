import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { flapDampingRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const geoDnsFailoverFlappingSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "dnsFailoverFlapCount",
      trackPeak: true,
      threshold: {
        value: 10,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "DNS failover flap count has crossed 10 flips.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "DNS failover flap count has dropped back below 10 flips.",
      },
    },
    { key: "clientConnectionResetRatePercent", trackPeak: true },
    { key: "clientErrorRatePercent", trackPeak: true },
  ],
  timedEvents,
  rules: flapDampingRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
