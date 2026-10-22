import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { replicaLagRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  READ_ROUTING_MODE_KEY,
  REPLICATION_BATCH_SIZE_KEY,
  WRITE_THROTTLE_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const readReplicaLagSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "replicaStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Replication lag has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Replication lag has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "replicationLagMs",
      trackPeak: true,
      threshold: {
        value: 3_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Replication lag has crossed 3 seconds.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Replication lag has dropped back below 3 seconds.",
      },
    },
    {
      key: "staleReadRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: replicaLagRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
};
