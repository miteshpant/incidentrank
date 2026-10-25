import type { ScenarioGoldenPath } from "./types";
import {
  CROSS_REGION_DEPENDENCY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
} from "../cross-region-latency-spike/definition";

/**
 * Extracted from cross-region-latency-spike.test.ts's "Finish from
 * optimal -> resolved/optimal" case (RELAX_GENERAL_TRAFFIC_ACTIONS, run
 * until RTT_SPIKE_MS + 20_000). RTT_SPIKE_MS = 30_000.
 */
export const crossRegionLatencySpikeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cross-region-latency-spike",
  actions: [
    { atMs: 31_000, controlKey: CROSS_REGION_DEPENDENCY_KEY, value: "localOnly" },
    { atMs: 32_000, controlKey: GENERAL_CONSISTENCY_MODE_KEY, value: "eventual" },
    { atMs: 33_000, controlKey: READ_ROUTING_KEY, value: "localRegion" },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
