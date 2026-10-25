import type { ScenarioGoldenPath } from "./types";
import { CONNECTION_REUSE_ENABLED_KEY, ROUTE_COMPLEXITY_KEY } from "../api-gateway-saturation/definition";

/**
 * Extracted from api-gateway-saturation.test.ts's "Finish from optimal ->
 * resolved/optimal" — enables connection reuse and simplifies route
 * complexity. This scenario has no acceptableCondition (single-tier,
 * confirmed in definition.ts), so any resolved path is automatically
 * optimal; asserted via evaluateCandidateDeclaredFinish.
 */
export const apiGatewaySaturationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "api-gateway-saturation",
  actions: [
    { atMs: 31_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
    { atMs: 31_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
  ],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
