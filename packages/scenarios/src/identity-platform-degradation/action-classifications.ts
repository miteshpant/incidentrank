import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  LOGIN_CONCURRENCY_LIMIT_KEY,
  MFA_POLICY_BY_RISK_TIER_KEY,
  MFA_RETRY_BACKOFF_KEY,
  PRIVILEGED_ACTION_MODE_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
  SESSION_TTL_SECONDS_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── mfaPolicyByRiskTier ──────────────────────────────────────────
  {
    id: "acr_1",
    controlKey: MFA_POLICY_BY_RISK_TIER_KEY,
    valueEquals: "bypass-all",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Broad MFA bypass removed mandatory second-factor protection",
      explanation:
        "Setting MFA policy to bypass everyone, including high-risk and privileged logins, made latency and failure-rate metrics look dramatically better — no login had to round-trip to the degraded MFA Provider at all. That apparent recovery is not real: it directly violates the invariant that high-risk authentication may never bypass mandatory MFA. Every tick this stayed active added to a permanent, non-resetting count of high-risk actions authenticated without MFA, which stays on the record even after the policy is restored, and materially penalizes Data Integrity and Reliability regardless of how healthy availability looked.",
    },
  },
  {
    id: "acr_2",
    controlKey: MFA_POLICY_BY_RISK_TIER_KEY,
    valueEquals: "risk-based-bounded-degrade",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Risk-based bounded degrade preserved security while restoring low-risk availability",
      explanation:
        "Switching to the risk-based bounded-degrade policy let low-risk logins use the explicitly-allowed degraded flow instead of being needlessly blocked, while keeping high-risk and privileged logins protected by mandatory MFA. This only works safely because the Risk Engine is still able to tell risk tiers apart — pairing this with a disabled Risk Engine would have removed that safety net.",
    },
  },
  {
    id: "acr_3",
    controlKey: MFA_POLICY_BY_RISK_TIER_KEY,
    valueEquals: "mandatory-all",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Mandatory-MFA-for-everyone is safe but blocks low-risk users needlessly",
      explanation:
        "Keeping MFA mandatory for every login protects against the central security risk this incident poses, but it also blocks low-risk logins that did not need to be blocked at all while the MFA Provider is degraded — a real, if safe, availability cost that a risk-tiered policy could have avoided.",
    },
  },

  // ── riskEngineMode ───────────────────────────────────────────────
  {
    id: "acr_4",
    controlKey: RISK_ENGINE_MODE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling the Risk Engine removed the ability to tell risk tiers apart",
      explanation:
        "With risk classification disabled, there is no reliable way to distinguish a low-risk login from a high-risk one — any risk-based-bounded-degrade policy set alongside this falls back to treating every login as potentially high-risk, needlessly blocking low-risk users who could otherwise have used the bounded degraded flow.",
    },
  },
  {
    id: "acr_5",
    controlKey: RISK_ENGINE_MODE_KEY,
    valueEquals: "cached-risk-scores",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Cached risk scores kept risk tiering usable while relieving Risk Engine load",
      explanation:
        "Serving short-lived cached risk classifications instead of computing a fresh score for every login relieves load on the Risk Engine during the incident without weakening the MFA policy — risk-based-bounded-degrade can still safely distinguish low-risk from high-risk logins.",
    },
  },

  // ── privilegedActionMode ─────────────────────────────────────────
  {
    id: "acr_6",
    controlKey: PRIVILEGED_ACTION_MODE_KEY,
    valueEquals: "allow-with-cached-risk",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Allowing privileged actions on cached risk removed live MFA protection",
      explanation:
        "Permitting privileged actions to proceed on a stale cached risk judgment without a live MFA challenge is a direct violation of the invariant that fail-open is never permitted for privileged or high-risk actions. This adds to the same permanent, non-resetting historical security count as a broad MFA bypass, and stays there even after this setting is reverted.",
    },
  },
  {
    id: "acr_7",
    controlKey: PRIVILEGED_ACTION_MODE_KEY,
    valueEquals: "temporarily-unavailable",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Taking privileged actions offline protected security without weakening it",
      explanation:
        "Explicitly marking privileged actions as temporarily unavailable, rather than leaving them dependent on a live MFA challenge the degraded provider often can't deliver, is an honest degraded choice: it trades some functionality for continued protection, never bypassing the mandatory-MFA requirement for privileged actions.",
    },
  },

  // ── tokenOnlyContinuation ────────────────────────────────────────
  {
    id: "acr_8",
    controlKey: TOKEN_ONLY_CONTINUATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Token-only continuation relieved Session Store load without touching MFA policy",
      explanation:
        "Allowing already-valid tokens to continue being served without a fresh Session Store lookup or a forced MFA re-challenge directly implements the invariant that existing valid tokens may be verified without forcing unnecessary MFA. This relieves real Session Store pressure for the large population of users who already hold a valid session, with no security tradeoff at all.",
    },
  },

  // ── sessionCacheMode ─────────────────────────────────────────────
  {
    id: "acr_9",
    controlKey: SESSION_CACHE_MODE_KEY,
    valueEquals: "relief-eviction",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Relief eviction lowered Session Store pressure, but protect active sessions first",
      explanation:
        "Enabling relief eviction genuinely lowers Session Store pressure by reclaiming stale entries over real elapsed time. Turn on token-only continuation first (or alongside it) — without it, relief eviction has no way to tell a currently-active session from a stale one, and risks invalidating active sessions unnecessarily, a direct violation of the invariant that session-store relief must not invalidate active sessions unnecessarily.",
    },
  },
  {
    id: "acr_10",
    controlKey: SESSION_CACHE_MODE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling the Session Store cache removed the only store-side pressure protection",
      explanation:
        "Turning off all store-side protection — no eviction, no admission shaping — leaves Session Store pressure to climb unchecked, strictly worse than leaving write-through behavior in place during an incident where store pressure is already rising on its own.",
    },
  },

  // ── loginConcurrencyLimit ────────────────────────────────────────
  {
    id: "acr_11",
    controlKey: LOGIN_CONCURRENCY_LIMIT_KEY,
    valueEquals: "unlimited",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Unlimited login concurrency transferred pressure onto the MFA Provider and Session Store",
      explanation:
        "Removing all admission shaping on login concurrency let a flood of concurrent login and session-recreation attempts hit the already-degraded MFA Provider and the already-pressured Session Store at the same time. Combined with aggressive MFA retries, this measurably worsened both systems rather than relieving either — pressure that looked like it needed more throughput actually needed less concurrency, not more.",
    },
  },
  {
    id: "acr_12",
    controlKey: LOGIN_CONCURRENCY_LIMIT_KEY,
    valueEquals: "throttled",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled login concurrency reduced simultaneous load on both downstream dependencies",
      explanation:
        "Capping concurrent login attempts directly reduced simultaneous pressure on the Session Store and the MFA Provider at the cost of some login queuing latency — a real, legitimate relief lever during this incident.",
    },
  },

  // ── mfaRetryBackoff ──────────────────────────────────────────────
  {
    id: "acr_13",
    controlKey: MFA_RETRY_BACKOFF_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Aggressive MFA retries amplified load on an already-degraded provider",
      explanation:
        "Retrying failed MFA challenges quickly and repeatedly against a provider that is already struggling adds more load to exactly the dependency that needs relief, and drives repeated session-recreation attempts against the Session Store at the same time — the pressure-transfer mechanism at the heart of this incident.",
    },
  },
  {
    id: "acr_14",
    controlKey: MFA_RETRY_BACKOFF_KEY,
    valueEquals: "backoff",
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Exponential backoff relieved real load on the degraded MFA Provider",
      explanation:
        "Applying real backoff between MFA retry attempts materially reduced the request volume hitting the degraded MFA Provider, directly relieving the pressure this incident's retry-amplification mechanism depends on.",
    },
  },

  // ── sessionTtlSeconds ────────────────────────────────────────────
  {
    id: "acr_15",
    controlKey: SESSION_TTL_SECONDS_KEY,
    valueEquals: 300,
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Shortening session TTL forced far more frequent re-authentication under pressure",
      explanation:
        "Cutting session lifetime to 5 minutes while the MFA Provider is degraded and the Session Store is under pressure forces sessions to re-authenticate far more often, pushing more concurrent logins onto both already-strained dependencies rather than relieving them.",
    },
  },
  {
    id: "acr_16",
    controlKey: SESSION_TTL_SECONDS_KEY,
    valueEquals: 7_200,
    whenTriggerEquals: { mfaProviderDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Extending session TTL reduced re-authentication frequency",
      explanation:
        "Extending session lifetime to 2 hours reduces how often sessions need to re-authenticate, lowering load on both the MFA Provider and the Session Store — most effective when paired with token-only continuation so existing valid sessions are genuinely protected rather than just living longer.",
    },
  },
];
