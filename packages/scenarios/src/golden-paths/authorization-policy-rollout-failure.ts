import type { ScenarioGoldenPath } from "./types";
import {
  CACHE_INVALIDATION_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLOUT_FREEZE_KEY,
} from "../authorization-policy-rollout-failure/definition";

/**
 * Extracted from authorization-policy-rollout-failure.test.ts's "safe
 * sequence: freeze -> pin -> invalidate -> wait for convergence reaches
 * OPTIMAL" (SAFE_FORWARD_FIX_ACTIONS), corroborated by the Scoring
 * describe block's "optimal path (converged-safe) scores near-maximum
 * with full dataIntegrity credit" — freezes the rollout, pins the
 * policy version back to v1, and actively invalidates the cache.
 * Asserted resolved/optimal via evaluateCandidateDeclaredFinish.
 */
export const authorizationPolicyRolloutFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "authorization-policy-rollout-failure",
  actions: [
    { atMs: 201_000, controlKey: ROLLOUT_FREEZE_KEY, value: "frozen" },
    { atMs: 202_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
    { atMs: 203_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
  ],
  finishAtMs: 595_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
