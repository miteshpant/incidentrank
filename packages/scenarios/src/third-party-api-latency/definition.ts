import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { vendorLatencyRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  API_TIMEOUT_MS_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const thirdPartyApiLatencySimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "checkoutStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Checkout capacity has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Checkout capacity has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "checkoutServiceThreadPoolUtilization",
      trackPeak: true,
      threshold: {
        value: 70,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Checkout thread pool utilization has crossed 70%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Checkout thread pool utilization has dropped back below 70%.",
      },
    },
    {
      key: "checkoutAbandonmentRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: vendorLatencyRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
