import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dataResidencyRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  FAIL_BACK_TO_EU_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const regulatoryDataResidencyViolationDuringFailoverSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "dataResidencyViolationMinutes",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "A data-residency violation has begun accruing.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The data-residency violation has stopped accruing.",
      },
    },
    { key: "euPersonalDataRecordsProcessedInUsCount", trackPeak: true },
    { key: "euRequestAvailabilityPercent", trackPeak: false },
  ],
  timedEvents,
  rules: dataResidencyRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
