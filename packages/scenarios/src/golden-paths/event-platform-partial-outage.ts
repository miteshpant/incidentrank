import type { ScenarioGoldenPath } from "./types";
import {
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  PARTITION_ISOLATION_KEY,
} from "../event-platform-partial-outage/definition";

/**
 * Extracted from event-platform-partial-outage.test.ts's "Completion
 * eligibility and scoring across executed paths" -> "OPTIMAL: the
 * fully-recovered safe path is eligible at the optimal tier and scores
 * well" (SAFE_ACTIONS, run past every recovery window), tier optimal.
 */
export const eventPlatformPartialOutageGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "event-platform-partial-outage",
  actions: [
    { atMs: 31_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
    { atMs: 32_000, controlKey: BATCH_SIZE_KEY, value: 100 },
    { atMs: 33_000, controlKey: CONSUMER_B_CONCURRENCY_KEY, value: 8 },
    { atMs: 34_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "circuit-breaker" },
  ],
  finishAtMs: 225_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
