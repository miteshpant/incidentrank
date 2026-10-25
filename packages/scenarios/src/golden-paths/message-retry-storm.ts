import type { ScenarioGoldenPath } from "./types";
import { DLQ_THRESHOLD_KEY, RETRY_COUNT_KEY } from "../message-retry-storm/definition";
import { DEPENDENCY_DEGRADES_MS } from "../message-retry-storm/timed-events";

/**
 * Extracted from message-retry-storm.test.ts's "Finish from the optimal
 * state resolves with tier optimal" case (good path 1: bounded retries +
 * DLQ enabled).
 */
export const messageRetryStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "message-retry-storm",
  actions: [
    { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
    { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
  ],
  finishAtMs: DEPENDENCY_DEGRADES_MS + 30_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
