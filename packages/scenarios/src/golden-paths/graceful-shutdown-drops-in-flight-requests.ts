import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
} from "../graceful-shutdown-drops-in-flight-requests/definition";

const DEPLOY_BEGINS_MS = 30_000;

/**
 * Extracted from graceful-shutdown-drops-in-flight-requests.test.ts's
 * "investigating all three signals, then raising the drain timeout to
 * 15s — reaches the investigated-fix path" — the scenario's own
 * authored strong path (branch A of the two valid remediation
 * tradeoffs). definition.ts's completion has no acceptableCondition
 * authored, so the resolved outcome is automatically tier optimal.
 */
export const gracefulShutdownDropsInFlightRequestsGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "graceful-shutdown-drops-in-flight-requests",
  actions: [
    { atMs: DEPLOY_BEGINS_MS + 1_000, controlKey: INSPECT_SHUTDOWN_HOOK_LOGS_KEY, value: true },
    {
      atMs: DEPLOY_BEGINS_MS + 2_000,
      controlKey: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
      value: true,
    },
    { atMs: DEPLOY_BEGINS_MS + 3_000, controlKey: INSPECT_DEPLOY_HISTORY_KEY, value: true },
    { atMs: DEPLOY_BEGINS_MS + 4_000, controlKey: DRAIN_TIMEOUT_SECONDS_KEY, value: 15 },
  ],
  finishAtMs: DEPLOY_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
