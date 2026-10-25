import type { ScenarioGoldenPath } from "./types";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
} from "../runaway-cloud-spend-during-healthy-traffic/definition";

/**
 * Extracted from runaway-cloud-spend-during-healthy-traffic.test.ts's
 * "OPTIMAL via Path A" case (PATH_A_ACTIONS: gradual rightsizing via the
 * Autoscaler's own thresholds — lower target utilization, lower the
 * replica floor, and scale idle capacity to the new minimum), run until
 * RIGHTSIZING_FULLY_DRAINED_MS + 25_000 so the fleet has fully drained
 * down to its new safe target.
 */
export const runawayCloudSpendDuringHealthyTrafficGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "runaway-cloud-spend-during-healthy-traffic",
  actions: [
    { atMs: 21_000, controlKey: AUTOSCALER_TARGET_UTILIZATION_KEY, value: 55 },
    { atMs: 22_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 6 },
    { atMs: 23_000, controlKey: IDLE_CAPACITY_POLICY_KEY, value: "scale-to-min" },
  ],
  finishAtMs: 645_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
