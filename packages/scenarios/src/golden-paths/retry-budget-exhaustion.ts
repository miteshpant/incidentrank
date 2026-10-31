import type { ScenarioGoldenPath } from "./types";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
} from "../retry-budget-exhaustion/definition";

const PRICING_DEGRADATION_BEGINS_MS = 30_000;

/**
 * Extracted from retry-budget-exhaustion.test.ts's "investigating retry
 * metrics then bounding retries then enabling the circuit breaker
 * reaches the correlated path" — the scenario's own authored strong
 * path. definition.ts's completion has no acceptableCondition authored,
 * so the resolved outcome is automatically tier optimal.
 */
export const retryBudgetExhaustionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "retry-budget-exhaustion",
  actions: [
    { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: INSPECT_RETRY_METRICS_KEY, value: true },
    { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
    {
      atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
      controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
      value: true,
    },
  ],
  finishAtMs: PRICING_DEGRADATION_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
