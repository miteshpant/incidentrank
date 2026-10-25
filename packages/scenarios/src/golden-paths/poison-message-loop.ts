import type { ScenarioGoldenPath } from "./types";
import {
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
} from "../poison-message-loop/definition";

/**
 * Extracted from poison-message-loop.test.ts's "reaches a sustained healthy
 * state with a bounded retry limit and the dead-letter queue enabled" case —
 * a bounded max-retry-attempts limit plus enabling the dead-letter queue.
 * This scenario has no acceptableCondition, so any resolved outcome is
 * "optimal".
 */
export const poisonMessageLoopGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "poison-message-loop",
  actions: [
    { atMs: 31_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 3 },
    { atMs: 31_000, controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY, value: true },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
