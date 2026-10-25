import type { ScenarioGoldenPath } from "./types";
import {
  CACHE_INVALIDATION_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
} from "../privilege-escalation-via-stale-authorization-cache/definition";
import {
  CONVERGENCE_FULLY_DONE_MS,
  SUSTAINED_UNCONVERGED_MS,
} from "../privilege-escalation-via-stale-authorization-cache/timed-events";

/**
 * Extracted from privilege-escalation-via-stale-authorization-cache.test.ts's
 * SAFE_PUSH_ACTIONS ("alternate strong path 1 (immediate push + verify)
 * reaches converged-safe" / "optimal path (converged-safe) scores
 * near-maximum") — immediate push-based cache invalidation plus
 * verify-before-trust convergence verification. Asserted eligible: true,
 * tier: "optimal".
 */
export const privilegeEscalationViaStaleAuthorizationCacheGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "privilege-escalation-via-stale-authorization-cache",
  actions: [
    { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_INVALIDATION_MODE_KEY, value: "immediate" },
    { atMs: SUSTAINED_UNCONVERGED_MS + 2_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
  ],
  finishAtMs: CONVERGENCE_FULLY_DONE_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
