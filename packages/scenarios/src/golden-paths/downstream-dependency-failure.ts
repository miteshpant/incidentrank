import type { ScenarioGoldenPath } from "./types";
import { CIRCUIT_BREAKER_ENABLED_KEY } from "../downstream-dependency-failure/definition";

/**
 * Extracted from downstream-dependency-failure.test.ts's "recovers
 * cleanly when the circuit breaker is enabled" — asserted
 * evaluateCandidateDeclaredFinish(...).outcome === "resolved". No
 * acceptableCondition/completion field is authored for this scenario, so
 * any resolved outcome is automatically tier "optimal".
 */
export const downstreamDependencyFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "downstream-dependency-failure",
  actions: [{ atMs: 31_000, controlKey: CIRCUIT_BREAKER_ENABLED_KEY, value: true }],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
