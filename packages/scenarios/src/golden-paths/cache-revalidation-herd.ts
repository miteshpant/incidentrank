import type { ScenarioGoldenPath } from "./types";
import { TTL_JITTER_ENABLED_KEY } from "../cache-revalidation-herd/definition";

const EXPIRY_APPROACHING_MS = 20_000;
const SYNCHRONIZED_EXPIRY_MS = 35_000;

/**
 * Extracted from cache-revalidation-herd.test.ts's "strong path (jitter):
 * resolves regardless of other controls" — no acceptableCondition is
 * authored for this scenario, so the resolved outcome is automatically
 * tier optimal.
 */
export const cacheRevalidationHerdGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cache-revalidation-herd",
  actions: [
    { atMs: EXPIRY_APPROACHING_MS + 1_000, controlKey: TTL_JITTER_ENABLED_KEY, value: true },
  ],
  finishAtMs: SYNCHRONIZED_EXPIRY_MS + 25_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
