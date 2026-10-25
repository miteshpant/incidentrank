import type { ScenarioDefinition } from "./types";
import {
  authorizationPolicyRolloutFailureSimulation,
  CACHE_INVALIDATION_KEY,
  EMERGENCY_OVERRIDE_LIST_KEY,
  FAIL_OPEN_MODE_KEY,
  POLICY_CACHE_TTL_SECONDS_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLBACK_SOURCE_POLICY_KEY,
  ROLLOUT_FREEZE_KEY,
  STAGED_COHORT_KEY,
} from "./authorization-policy-rollout-failure/definition";
import { authorizationPolicyRolloutFailureCandidateUI } from "./authorization-policy-rollout-failure/candidate-ui";
import { AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING } from "./authorization-policy-rollout-failure/scoring";

/**
 * Authorization Policy Rollout Failure — a paid, Principal-level
 * IncidentRank scenario (docs/implementation_plan/phase6d3.md, scenario
 * 74). A policy rollout has introduced selective false-denies on a
 * subset of resource/identity combinations, while some Policy Decision
 * Point instances' local caches still enforce the previous, correct
 * policy version — a real policy-version-skew-across-the-fleet
 * mechanism, not a uniform outage.
 */
export const authorizationPolicyRolloutFailure: ScenarioDefinition = {
  id: "authorization-policy-rollout-failure",
  slug: "authorization-policy-rollout-failure",
  version: 1,
  name: "Authorization Policy Rollout Failure",
  description:
    "A policy rollout has introduced selective false-denies on a subset of resource/identity combinations, while some Policy Decision Point caches across the fleet still enforce the previous, correct policy version — a real policy-version-skew mechanism, not a uniform outage. Five business invariants govern every decision here: (1) unauthorized access must never be granted to reduce false-denies — availability loss is always preferable to unauthorized access for protected resources; (2) critical/protected resources default fail-closed, with no exception; (3) a rollback or pin to a known-good policy version is not complete until cache convergence across the fleet has been verified — fixing the source policy changes what NEW cache fetches receive, it does not retroactively change what already-cached Policy Decision Point instances are currently enforcing; (4) mixed policy versions across the fleet must be observable and bounded — exposure must be frozen before it is fixed, never left to keep expanding while you investigate; (5) availability loss is preferable to unauthorized access for protected resources, full stop. Decide how to stop the regression from spreading further, how to restore the known-good policy without assuming caches have already converged just because the source looks fixed, how to bound the blast radius for non-critical resources while convergence completes, and when fleet-wide convergence is genuinely verified rather than merely assumed.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: authorizationPolicyRolloutFailureSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Authorization",
      "Policy Rollout",
      "Cache Convergence",
      "Fail-Open vs Fail-Closed",
      "Historical Damage",
      "Security Correctness",
    ],
    skills: [
      "Distinguishing a source-of-truth fix from fleet-wide cache convergence",
      "Recognizing fail-open as an availability/security tradeoff trap",
      "Sequencing freeze -> pin -> invalidate -> verify -> restore",
      "Choosing a bounded, resource-class-scoped degraded mode over a global shortcut",
    ],
    shortDescription:
      "A policy rollout causes selective false-denies while some caches across the fleet still serve the old policy version — fail-open fixes availability but creates permanent unauthorized access.",
  },
};

export {
  authorizationPolicyRolloutFailureSimulation,
  authorizationPolicyRolloutFailureCandidateUI,
  AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
  CACHE_INVALIDATION_KEY,
  EMERGENCY_OVERRIDE_LIST_KEY,
  FAIL_OPEN_MODE_KEY,
  POLICY_CACHE_TTL_SECONDS_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLBACK_SOURCE_POLICY_KEY,
  ROLLOUT_FREEZE_KEY,
  STAGED_COHORT_KEY,
};
