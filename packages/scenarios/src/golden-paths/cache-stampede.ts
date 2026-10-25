import type { ScenarioGoldenPath } from "./types";
import { REQUEST_COALESCING_ENABLED_KEY } from "../cache-stampede/definition";

/**
 * Extracted from cache-stampede.test.ts's "recovers cleanly when request
 * coalescing is enabled" — no acceptableCondition is authored for this
 * scenario, so the resolved outcome is automatically tier optimal.
 */
export const cacheStampedeGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cache-stampede",
  actions: [{ atMs: 31_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
