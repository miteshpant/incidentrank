import type {
  NumericWatchFieldConfig,
  ScenarioSimulationDefinition,
  SeverityFieldConfig,
} from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { degradedRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

const TICK_MS = 1_000;

/**
 * Narrates checkout success crossing into/out of critical, generalizing
 * the engine's old hardcoded CHECKOUT_CRITICAL/CHECKOUT_RECOVERING
 * behavior into authored scenario config.
 */
const severityFields: SeverityFieldConfig[] = [
  {
    key: "paymentTraffic",
    announceCritical: {
      enteringType: "SEVERITY_CRITICAL",
      enteringMessage: "Checkout success has dropped to a critical level.",
      recoveringType: "SEVERITY_RECOVERED",
      recoveringMessage: "Checkout success is recovering.",
    },
  },
  {
    key: "dbPressure",
    announceCritical: {
      enteringType: "SEVERITY_CRITICAL",
      enteringMessage: "Database pressure has reached a critical level.",
      recoveringType: "SEVERITY_RECOVERED",
      recoveringMessage: "Database pressure has recovered.",
    },
  },
];

/**
 * Tracks peak Kafka settlement lag and narrates it crossing the old
 * hardcoded 10,000-message threshold, generalizing the engine's old
 * KAFKA_BACKLOG_HIGH/KAFKA_BACKLOG_RECOVERED behavior into authored config.
 */
const numericWatchFields: NumericWatchFieldConfig[] = [
  {
    key: "kafkaLagMessages",
    trackPeak: true,
    threshold: {
      value: 10_000,
      enteringType: "THRESHOLD_CROSSED",
      enteringMessage: "Kafka settlement backlog is high.",
      recoveringType: "THRESHOLD_RECOVERED",
      recoveringMessage: "Kafka settlement backlog has recovered.",
    },
  },
];

export const paymentRetryStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields,
  numericWatchFields,
  timedEvents,
  rules: degradedRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
