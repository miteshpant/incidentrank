import type { ScenarioGoldenPath } from "./types";
import { RESPONSE_PROJECTION_ENABLED_KEY } from "../large-payload-regression/definition";

const REGRESSION_DEPLOYED_MS = 30_000;

/**
 * Extracted from large-payload-regression.test.ts's "Finish from optimal
 * (projection) -> resolved/optimal" (enabling response projection) — tier
 * optimal. definition.ts's completion has no acceptableCondition authored,
 * so any resolved outcome is automatically tier optimal.
 */
export const largePayloadRegressionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "large-payload-regression",
  actions: [
    {
      atMs: REGRESSION_DEPLOYED_MS + 1_000,
      controlKey: RESPONSE_PROJECTION_ENABLED_KEY,
      value: true,
    },
  ],
  finishAtMs: REGRESSION_DEPLOYED_MS + 40_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
