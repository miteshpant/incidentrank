import type { ScenarioGoldenPath } from "./types";
import { ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY } from "../cascading-service-failure/definition";

/**
 * Extracted from cascading-service-failure.test.ts's "recovers checkout
 * success by isolating the root cause" / scoring test's clean-isolation
 * path — no acceptableCondition is authored for this scenario, so the
 * resolved outcome is automatically tier optimal.
 */
export const cascadingServiceFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cascading-service-failure",
  actions: [
    { atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true },
  ],
  finishAtMs: 55_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
