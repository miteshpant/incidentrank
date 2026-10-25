import type { ScenarioGoldenPath } from "./types";
import { ROLLBACK_TO_PREVIOUS_VERSION_KEY } from "../deployment-regression/definition";

/**
 * Extracted from deployment-regression.test.ts's "recovers cleanly when
 * rolled back to the previous version" — asserted
 * evaluateCandidateDeclaredFinish(...).outcome === "resolved". No
 * acceptableCondition is authored for this scenario (no `completion`
 * field at all), so any resolved outcome is automatically tier
 * "optimal".
 */
export const deploymentRegressionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "deployment-regression",
  actions: [{ atMs: 31_000, controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY, value: true }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
