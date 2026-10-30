import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { contentionRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
  REDIS_CONNECTION_POOL_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const checkoutPaymentInventoryRedisContentionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "redisConnectionUtilizationPercent",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Redis connection utilization has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Redis connection utilization has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "redisConnectionUtilizationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Redis connection utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Redis connection utilization has dropped back below 90%.",
      },
    },
    { key: "paymentRetryRatePercent", trackPeak: true },
    { key: "inventoryP95LatencyMs", trackPeak: true },
  ],
  timedEvents,
  rules: contentionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
