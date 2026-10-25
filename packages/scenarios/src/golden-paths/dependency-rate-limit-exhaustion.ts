import type { ScenarioGoldenPath } from "./types";
import {
  CACHING_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
} from "../dependency-rate-limit-exhaustion/definition";

/**
 * Extracted from dependency-rate-limit-exhaustion.test.ts's "strong path:
 * caching + request coalescing durably reduce call volume below the
 * quota's burn rate" — asserted resolved/optimal via
 * evaluateCandidateDeclaredFinish in the "Finish from optimal
 * (caching+coalescing) -> resolved/optimal" test case.
 */
export const dependencyRateLimitExhaustionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "dependency-rate-limit-exhaustion",
  actions: [
    { atMs: 31_000, controlKey: CACHING_ENABLED_KEY, value: true },
    { atMs: 31_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
  ],
  finishAtMs: 71_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
