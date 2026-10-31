import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { staleFeatureFlagKillSwitchRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const staleFeatureFlagKillSwitchSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "priceMismatchRatePercent",
      trackPeak: true,
      threshold: {
        value: 10,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Price mismatch rate has crossed 10%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Price mismatch rate has dropped back below 10%.",
      },
    },
    { key: "legacyPricingEngineTrafficSharePercent", trackPeak: true },
  ],
  timedEvents,
  rules: staleFeatureFlagKillSwitchRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
