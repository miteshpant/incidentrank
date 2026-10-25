import type { ScenarioGoldenPath } from "./types";
import { MAX_INSTANCE_COUNT_KEY } from "../autoscaling-failure/definition";

/**
 * Extracted from autoscaling-failure.test.ts's "recovers cleanly when the
 * instance cap is raised to an adequate level, and resolves on an
 * explicit Finish declaration" — raises the max instance count to 16.
 * This scenario has no completion field at all (defaults to automatic,
 * no acceptableCondition), so any resolved path is automatically
 * optimal; asserted via evaluateCandidateDeclaredFinish.
 */
export const autoscalingFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "autoscaling-failure",
  actions: [{ atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
