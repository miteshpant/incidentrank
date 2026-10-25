import type { ScenarioGoldenPath } from "./types";
import {
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  RETRY_BACKOFF_STRATEGY_KEY,
} from "../rate-limit-failure/definition";

/**
 * Extracted from rate-limit-failure.test.ts's "reaches a sustained healthy
 * state with client-side rate limiting and exponential-with-jitter backoff"
 * case — enabling client-side rate limiting plus exponential-with-jitter
 * retry backoff. This scenario has no acceptableCondition, so any resolved
 * outcome is "optimal".
 */
export const rateLimitFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "rate-limit-failure",
  actions: [
    { atMs: 31_000, controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY, value: true },
    { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
