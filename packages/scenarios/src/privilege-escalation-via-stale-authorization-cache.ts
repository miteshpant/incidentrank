import type { ScenarioDefinition } from "./types";
import {
  privilegeEscalationViaStaleAuthorizationCacheSimulation,
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
} from "./privilege-escalation-via-stale-authorization-cache/definition";
import { privilegeEscalationViaStaleAuthorizationCacheCandidateUI } from "./privilege-escalation-via-stale-authorization-cache/candidate-ui";
import { PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING } from "./privilege-escalation-via-stale-authorization-cache/scoring";

/**
 * Privilege Escalation via Stale Authorization Cache — a paid,
 * Principal-level IncidentRank scenario (Phase 6E.1, scenario 81). A
 * privilege is revoked at the Policy Store (the source of truth), but
 * the revocation has not yet propagated to a subset of Authorization
 * Layer caches — some cache instances still grant the now-revoked
 * privilege, while others correctly deny it. This is a real
 * cache-CONVERGENCE CORRECTNESS problem with live security
 * consequences, not a generic cache-staleness performance issue.
 */
export const privilegeEscalationViaStaleAuthorizationCache: ScenarioDefinition = {
  id: "privilege-escalation-via-stale-authorization-cache",
  slug: "privilege-escalation-via-stale-authorization-cache",
  version: 1,
  name: "Privilege Escalation via Stale Authorization Cache",
  description:
    "A privilege has been revoked at the Policy Store, but the revocation has not yet propagated to a subset of Authorization Layer caches — some cache instances still grant the now-revoked privilege, while others correctly deny it. Four business invariants govern every decision here: (1) a revoked privilege must stop being honored as soon as the source of truth has revoked it, within an authored convergence bound; (2) fail-closed (deny) is the safe default when cache state cannot be verified as converged; (3) broadly disabling authorization checks to restore availability is never acceptable, regardless of how long convergence takes; (4) historical unauthorized access granted via stale cache state must be recorded and must not be erased merely by achieving convergence. The scenario's distinct security invariant, beyond those four: a request must never be granted access based on a privilege that has already been revoked at the source, even if a stale cache instance believes it is still valid. Decide how to propagate the revocation across the fleet, what posture to take while convergence is uncertain, how to verify convergence rather than merely assume it from elapsed time, and whether a bounded, deliberately slower safe-degraded tradeoff is worth taking while the fleet finishes converging.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: privilegeEscalationViaStaleAuthorizationCacheSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Authorization",
      "Privilege Revocation",
      "Cache Convergence",
      "Fail-Open vs Fail-Closed",
      "Historical Damage",
      "Security Correctness",
    ],
    skills: [
      "Distinguishing a revocation at the source from fleet-wide cache convergence",
      "Recognizing fail-open and broad cache trust as availability/security tradeoff traps",
      "Verifying convergence before broadly re-trusting a cache layer, rather than assuming it from elapsed time",
      "Choosing a bounded, source-of-truth-backed degraded mode over a blanket shortcut",
    ],
    shortDescription:
      "A privilege revocation has not yet converged across the cache fleet — some caches still grant it while others correctly deny it, and fail-open fixes availability while actively granting unauthorized access.",
  },
};

export {
  privilegeEscalationViaStaleAuthorizationCacheSimulation,
  privilegeEscalationViaStaleAuthorizationCacheCandidateUI,
  PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
};
