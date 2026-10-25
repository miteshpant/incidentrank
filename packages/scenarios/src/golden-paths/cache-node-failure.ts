import type { ScenarioGoldenPath } from "./types";
import { CACHE_NODE_COUNT_KEY } from "../cache-node-failure/definition";

/**
 * Extracted from cache-node-failure.test.ts's "good path A" (restoring
 * cache node capacity) — scores 955/1000, tier optimal.
 */
export const cacheNodeFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cache-node-failure",
  actions: [{ atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
