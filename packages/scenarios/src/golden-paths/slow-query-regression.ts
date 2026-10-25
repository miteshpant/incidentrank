import type { ScenarioGoldenPath } from "./types";
import { FORCE_INDEX_HINT_ENABLED_KEY } from "../slow-query-regression/definition";

/**
 * Extracted from slow-query-regression.test.ts's "scores the full
 * index-hint recovery as a near-perfect run" (scoring path) — definition.ts
 * has no acceptableCondition, so the resolved outcome is optimal tier by
 * the architecture's inference rule.
 */
export const slowQueryRegressionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "slow-query-regression",
  actions: [{ atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true }],
  finishAtMs: 85_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
