import type { ScenarioGoldenPath } from "./types";
import { BACKOFF_KEY, CIRCUIT_BREAKER_KEY, RETRIES_KEY } from "../payment-retry-storm/controls";

/**
 * Extracted from payment-retry-storm.test.ts's "good" path (the
 * circuit-breaker-good-recovery rule: retries<=1, backoff exponential,
 * circuitBreaker on) in "orders good > partial > baseline > harmful" —
 * reaches checkoutSuccessRate 96, satisfying and sustaining
 * successCondition. This scenario has no acceptableCondition, so any
 * resolved outcome is "optimal". Payment Retry Storm predates the generic
 * catalog pattern: its own simulation export is paymentRetryStormSimulation
 * from ./payment-retry-storm/definition, and its controls live at
 * ./payment-retry-storm/controls (not alongside a definition.ts the way
 * other built-in scenarios' controls do).
 */
export const paymentRetryStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "payment-retry-storm",
  actions: [
    { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
    { atMs: 90_000, controlKey: BACKOFF_KEY, value: "exponential" },
    { atMs: 120_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
  ],
  finishAtMs: 240_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
