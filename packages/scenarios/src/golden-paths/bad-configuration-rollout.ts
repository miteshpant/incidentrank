import type { ScenarioGoldenPath } from "./types";
import { CONFIG_REVERT_ENABLED_KEY } from "../bad-configuration-rollout/definition";

/**
 * Extracted from bad-configuration-rollout.test.ts's "recovers cleanly by
 * reverting to the last-known-good configuration" — no acceptableCondition
 * is authored for this scenario, so the resolved outcome is automatically
 * tier optimal.
 */
export const badConfigurationRolloutGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "bad-configuration-rollout",
  actions: [{ atMs: 31_000, controlKey: CONFIG_REVERT_ENABLED_KEY, value: true }],
  finishAtMs: 45_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
