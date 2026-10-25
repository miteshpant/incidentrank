import type { ScenarioGoldenPath } from "./types";
import { AUTH_SERVICE_INSTANCES_KEY } from "../authentication-service-degradation/definition";

/**
 * Extracted from authentication-service-degradation.test.ts's "reaches a
 * sustained healthy state by scaling auth service capacity" — scales
 * auth service instances up to 16. This scenario has no
 * acceptableCondition (single-tier, confirmed in definition.ts), so any
 * resolved path is automatically optimal.
 */
export const authenticationServiceDegradationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "authentication-service-degradation",
  actions: [{ atMs: 31_000, controlKey: AUTH_SERVICE_INSTANCES_KEY, value: 16 }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
