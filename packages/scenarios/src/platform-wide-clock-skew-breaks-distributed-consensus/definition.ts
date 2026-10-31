import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { clockSkewRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
  FORCE_LEADER_REELECTION_KEY,
  RESTART_LOCK_SERVICE_KEY,
  RESTART_LEDGER_SERVICE_KEY,
  RESTART_RATE_LIMITER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const platformWideClockSkewBreaksDistributedConsensusSimulation: ScenarioSimulationDefinition =
  {
    tickMs: TICK_MS,
    architecture,
    controls,
    initialValues,
    initialComponentHealth: healthyComponentHealth,
    severityFields: [],
    numericWatchFields: [
      {
        key: "fleetClockSkewMs",
        trackPeak: true,
        threshold: {
          value: 500,
          enteringType: "THRESHOLD_CROSSED",
          enteringMessage: "Fleet clock skew has crossed 500ms.",
          recoveringType: "THRESHOLD_RECOVERED",
          recoveringMessage: "Fleet clock skew has dropped back below 500ms.",
        },
      },
      { key: "lockServiceSplitBrainCount", trackPeak: true },
      { key: "ledgerOutOfOrderWriteRatePercent", trackPeak: true },
      { key: "rateLimiterFalseThrottleRatePercent", trackPeak: true },
    ],
    timedEvents,
    rules: clockSkewRules,
    revenueLossRatePerMinute,
    infrastructureCost,
    successCondition,
    failureCondition,
    actionClassifications,
  };
