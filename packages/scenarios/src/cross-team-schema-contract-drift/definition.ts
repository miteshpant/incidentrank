import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { schemaContractDriftRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_SCHEMA_DIFF_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const crossTeamSchemaContractDriftSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "analyticsCorruptedRowPercent",
      trackPeak: true,
      threshold: {
        value: 70,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Analytics corrupted row percent has crossed 70%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Analytics corrupted row percent has dropped back below 70%.",
      },
    },
    { key: "billingDroppedEventCount", trackPeak: true },
    { key: "fraudConsumerLagSeconds", trackPeak: true },
  ],
  timedEvents,
  rules: schemaContractDriftRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
