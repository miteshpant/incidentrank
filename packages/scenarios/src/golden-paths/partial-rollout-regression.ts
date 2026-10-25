import type { ScenarioGoldenPath } from "./types";
import { ROLLBACK_TO_OLD_VERSION_KEY } from "../partial-rollout-regression/definition";

const REGRESSION_ACTIVE_MS = 30_000;

/**
 * Extracted from partial-rollout-regression.test.ts's "Finish from optimal
 * (rollback) -> resolved/optimal" case — full rollback to the old version,
 * which recovers both versions and marks the regression removed. This
 * scenario has no acceptableCondition, so any resolved outcome is "optimal".
 */
export const partialRolloutRegressionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "partial-rollout-regression",
  actions: [
    { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLBACK_TO_OLD_VERSION_KEY, value: true },
  ],
  finishAtMs: REGRESSION_ACTIVE_MS + 40_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
