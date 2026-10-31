import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { multiAzStorageFailureDuringMigrationRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  PAUSE_MIGRATION_KEY,
  MIGRATION_RETRY_BACKOFF_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const multiAzStorageFailureDuringMigrationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "azCConnectionUtilizationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "AZ-C connection utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "AZ-C connection utilization has dropped back below 90%.",
      },
    },
    { key: "appServiceErrorRatePercent", trackPeak: true },
    { key: "migrationRetryRatePerMinute", trackPeak: true },
  ],
  timedEvents,
  rules: multiAzStorageFailureDuringMigrationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
