import type { ScenarioDefinition } from "./types";
import {
  identityPlatformDegradationSimulation,
  LOGIN_CONCURRENCY_LIMIT_KEY,
  MFA_POLICY_BY_RISK_TIER_KEY,
  MFA_RETRY_BACKOFF_KEY,
  PRIVILEGED_ACTION_MODE_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
  SESSION_TTL_SECONDS_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
} from "./identity-platform-degradation/definition";
import { identityPlatformDegradationCandidateUI } from "./identity-platform-degradation/candidate-ui";
import { IDENTITY_PLATFORM_DEGRADATION_SCORING } from "./identity-platform-degradation/scoring";

/**
 * Identity Platform Degradation — a paid, Principal-level IncidentRank
 * scenario (docs/implementation_plan/phase6d3.md, scenario 73). The
 * MFA Provider degrades and Session Store pressure rises concurrently
 * — two independently-caused problems, not one. Token Verification
 * stays fully healthy throughout, which must not be mistaken for
 * "everything is fine": existing sessions verifying correctly says
 * nothing about whether new logins or MFA challenges can succeed.
 *
 * Five business invariants govern every decision here: (1) existing
 * valid tokens may be verified without forcing unnecessary MFA — an
 * already-authenticated session should never be made to re-challenge
 * just because other parts of the system are under pressure; (2)
 * high-risk authentication may never bypass mandatory MFA, regardless
 * of how much it would improve availability or dashboards to do so;
 * (3) fail-open is never permitted for privileged or high-risk
 * actions — if the MFA Provider cannot reliably protect them, they are
 * blocked or taken explicitly offline, never silently waved through;
 * (4) low-risk users may enter a bounded degraded mode, but only if
 * policy explicitly allows it and the system can still reliably tell a
 * low-risk login from a high-risk one; (5) session-store relief must
 * not invalidate active sessions unnecessarily — relieving pressure by
 * evicting sessions is only safe once active sessions are protected
 * first. A broad MFA bypass is the central trap: it measurably
 * improves login latency and failure-rate dashboards while directly
 * violating invariants (2) and (3), and it creates a permanent,
 * non-resetting historical security consequence that restoring policy
 * afterward does not erase. Decide how to keep low-risk users moving
 * without weakening protection for high-risk and privileged actions,
 * how to relieve Session Store pressure without unnecessarily evicting
 * active sessions, and how much elapsed recovery time the MFA Provider
 * and the Session Store each genuinely need before handing the
 * incident back.
 */
export const identityPlatformDegradation: ScenarioDefinition = {
  id: "identity-platform-degradation",
  slug: "identity-platform-degradation",
  version: 1,
  name: "Identity Platform Degradation",
  description:
    "The MFA Provider has begun returning elevated latency and intermittent failures, while Session Store write/lookup pressure is independently rising at the same time — two concurrent, separately-caused problems, not one. Token Verification remains fully healthy throughout, which must not be read as 'everything is fine': an already-valid token verifying successfully says nothing about whether a new login or a fresh MFA challenge can currently succeed. Five business invariants govern every decision here: (1) existing valid tokens may be verified without forcing unnecessary MFA; (2) high-risk authentication may never bypass mandatory MFA, no matter how much it would improve availability metrics to do so; (3) fail-open is never permitted for privileged or high-risk actions — if MFA cannot reliably protect them right now, they are blocked or explicitly taken offline, never silently waved through; (4) low-risk users may enter a bounded degraded mode, but only when policy explicitly allows it and risk tiers can still be reliably told apart; (5) session-store relief must not invalidate active sessions unnecessarily. A broad MFA bypass is this incident's central trap: it makes login latency and failure-rate dashboards look dramatically better while directly violating invariants (2) and (3), and it creates a permanent, non-resetting historical count of high-risk actions authenticated without MFA that restoring policy afterward does not erase. Decide how to keep low-risk traffic moving without weakening protection for high-risk and privileged actions, how to relieve Session Store pressure without unnecessarily invalidating active sessions, and how much elapsed recovery time the MFA Provider and the Session Store each genuinely need before handing the incident back.",
  difficulty: "principal",
  estimatedMinutes: 22,
  isFree: false,
  simulation: identityPlatformDegradationSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Authentication",
      "MFA",
      "Session Management",
      "Risk-Based Policy",
      "Historical Damage",
      "Fail-Open vs Fail-Closed",
    ],
    skills: [
      "Distinguishing a healthy decoy signal from the real failure domain",
      "Choosing a risk-tiered degraded policy instead of a binary fail-open/fail-closed choice",
      "Recognizing that an availability-improving security bypass creates permanent damage",
      "Separating session-store capacity relief from authentication-provider recovery",
    ],
    shortDescription:
      "The MFA Provider degrades and Session Store pressure rises at the same time — a broad MFA bypass looks like it fixes everything, but it doesn't.",
  },
};

export {
  identityPlatformDegradationSimulation,
  identityPlatformDegradationCandidateUI,
  IDENTITY_PLATFORM_DEGRADATION_SCORING,
  LOGIN_CONCURRENCY_LIMIT_KEY,
  MFA_POLICY_BY_RISK_TIER_KEY,
  MFA_RETRY_BACKOFF_KEY,
  PRIVILEGED_ACTION_MODE_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
  SESSION_TTL_SECONDS_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
};
