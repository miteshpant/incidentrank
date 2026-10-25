import type { ScenarioGoldenPath } from "./types";
import { ENRICHMENT_CALL_ENABLED_KEY } from "../fan-out-request-explosion/definition";

/**
 * Extracted from fan-out-request-explosion.test.ts's "Finish from optimal ->
 * resolved/optimal" (strong path: excluding the optional enrichment call).
 * This scenario has no acceptableCondition, so any resolved outcome is
 * automatically tier "optimal".
 */
export const fanOutRequestExplosionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "fan-out-request-explosion",
  actions: [
    { atMs: 76_000, controlKey: ENRICHMENT_CALL_ENABLED_KEY, value: false },
  ],
  finishAtMs: 95_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
