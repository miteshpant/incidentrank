import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { retryBudgetExhaustionRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  CIRCUIT_BREAKER_ENABLED_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const retryBudgetExhaustionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "retryAmplificationRatio",
      trackPeak: true,
      threshold: {
        value: 2,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Retry amplification ratio has crossed 2x.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Retry amplification ratio has dropped back below 2x.",
      },
    },
    { key: "pricingP95LatencyMs", trackPeak: true },
    { key: "pricingErrorRatePercent", trackPeak: true },
  ],
  timedEvents,
  rules: retryBudgetExhaustionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
