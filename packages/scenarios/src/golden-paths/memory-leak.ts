import type { ScenarioGoldenPath } from "./types";
import { MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY } from "../memory-leak/definition";

/**
 * Extracted from memory-leak.test.ts's "recovers durably when the
 * memory-limit auto-restart policy is enabled" case. This scenario has no
 * authored acceptableCondition (see definition.ts), so any Finish that
 * reaches outcome "resolved" is automatically tier "optimal" — confirmed
 * by the test's own `evaluateCandidateDeclaredFinish(...).outcome ===
 * "resolved"` assertion (Phase 7.1 migration off raw state.status checks).
 */
export const memoryLeakGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "memory-leak",
  actions: [
    { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
  ],
  finishAtMs: 46_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
