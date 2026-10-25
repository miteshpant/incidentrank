import type { ScenarioGoldenPath } from "./types";
import {
  API_TIMEOUT_MS_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
} from "../third-party-api-latency/definition";

/**
 * Extracted from third-party-api-latency.test.ts's `goodActions` (the
 * "reaches the expected terminal/incident states for each sequence" test)
 * — confirms evaluateCandidateDeclaredFinish(...).outcome === "resolved"
 * on this sequence. definition.ts has no acceptableCondition, so resolved
 * is optimal tier by the architecture's inference rule.
 */
export const thirdPartyApiLatencyGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "third-party-api-latency",
  actions: [
    { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 2_000 },
    { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
    { atMs: 31_000, controlKey: ASYNC_PROCESSING_ENABLED_KEY, value: true },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
