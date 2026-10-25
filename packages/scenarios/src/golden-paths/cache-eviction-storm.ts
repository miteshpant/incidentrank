import type { ScenarioGoldenPath } from "./types";
import { CACHE_ADMISSION_POLICY_KEY } from "../cache-eviction-storm/definition";

const EVICTION_CHURN_RISING_MS = 30_000;

/**
 * Extracted from cache-eviction-storm.test.ts's "never auto-resolves even
 * once the success condition is genuinely sustained" test — no
 * acceptableCondition is authored for this scenario, so the resolved
 * outcome is automatically tier optimal (explicitly asserted there via
 * finish.completionTier === "optimal").
 */
export const cacheEvictionStormGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cache-eviction-storm",
  actions: [
    {
      atMs: EVICTION_CHURN_RISING_MS + 1_000,
      controlKey: CACHE_ADMISSION_POLICY_KEY,
      value: "sizeAwareAdmission",
    },
  ],
  finishAtMs: EVICTION_CHURN_RISING_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
