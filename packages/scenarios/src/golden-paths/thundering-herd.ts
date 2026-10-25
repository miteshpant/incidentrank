import type { ScenarioGoldenPath } from "./types";
import { CLIENT_JITTER_ENABLED_KEY } from "../thundering-herd/definition";

/**
 * Extracted from thundering-herd.test.ts's "scores a clean jitter-enabled
 * recovery near the maximum" (also matches "recovers cleanly when client
 * jitter is enabled") — confirms evaluateCandidateDeclaredFinish(...)
 * .outcome === "resolved". definition.ts has no acceptableCondition, so
 * resolved is optimal tier by the architecture's inference rule. Distinct
 * from cache-eviction-storm (the scenario renamed from "Thundering Herd"
 * during Phase 6C).
 */
export const thunderingHerdGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "thundering-herd",
  actions: [{ atMs: 31_000, controlKey: CLIENT_JITTER_ENABLED_KEY, value: true }],
  finishAtMs: 46_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
