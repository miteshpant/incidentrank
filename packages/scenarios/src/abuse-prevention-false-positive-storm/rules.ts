import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ABUSE_TRAFFIC_BLOCK_KEY,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  edge: "healthy",
  "abuse-detection": "healthy",
  "rate-limiter": "healthy",
  identity: "healthy",
  "core-api": "healthy",
};

const falsePositiveHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "abuse-detection": "critical",
  "rate-limiter": "degraded",
};

const bypassedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "abuse-detection": "critical",
  "rate-limiter": "critical",
  "core-api": "degraded",
};

const unreliableExemptionHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "abuse-detection": "degraded",
  identity: "degraded",
};

const targetedFixHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "abuse-detection": "degraded",
};

/**
 * Authored rule table for Abuse-Prevention False Positive Storm, ordered
 * most-specific-first: unsafe security traps first (they win regardless
 * of every other control, because letting real abuse through is never
 * acceptable no matter how healthy legitimate-user availability looks),
 * followed by the unreliable-exemption trap, the legitimate targeted-fix
 * family (three independently-viable alternate strong paths), the
 * independent-abuse-signal-removed trap, the plain baseline, and a
 * healthy-default fallback.
 *
 * ROOT CAUSE: a detection-rule update (v2) begins over-matching on a
 * legitimate traffic pattern, blocking a large population of real users
 * — WHILE actual abusive traffic is also genuinely present in the mix,
 * completely independent of the rule defect (abuseRequestsAllowedRate's
 * baseline of 0.5 never comes from the bad rule; it is the ongoing
 * background abuse rate this platform always has to contain). These are
 * two separate populations sharing the same blocked-request metric
 * surface, which is exactly what makes the tempting fix dangerous: a
 * candidate who only watches legitimateUserSuccessRate and reaches for
 * the single global "turn off enforcement" lever fixes one population by
 * exposing the platform to the other.
 *
 * ── HISTORICAL DAMAGE MODEL (binding for this scenario, mirrors
 * identity-platform-degradation's highRiskActionsAuthenticatedWithoutMfaCount
 * and authorization-policy-rollout-failure's cumulativeUnauthorizedAccessCount)
 * cumulativeAbuseRequestsAllowedCount is modeled as a sequence of
 * authored snapshots keyed to elapsed trigger-time windows
 * (falsePositivesActive / sustainedFalsePositives), not as runtime
 * arithmetic — the engine has no mechanism for a synthetic "ever
 * activated" flag (rule matches never write triggers; see tick.ts).
 * While rateLimiterMode stays "disabled" (or "relaxed"), the count
 * climbs at each later-firing elapsed-time trigger for the SAME
 * "still bypassing" rule family. The moment enforcement is restored to
 * "strict", the live incidentState moves to a family that always
 * carries cumulativeAbuseRequestsAllowedCount: 0 going forward — this is
 * the same limitation identity-platform-degradation and
 * authorization-policy-rollout-failure accept for their own live-value
 * damage counters. What is genuinely non-resetting and irreversible is
 * the peak-tracked value: state.peaks.peakValues.cumulativeAbuseRequestsAllowedCount
 * (a numericWatchField with trackPeak: true — see definition.ts), which
 * the engine computes generically as Math.max(previousPeak,
 * currentValue) every tick regardless of which rule currently matches,
 * and which extractScoringInputs/extractFinishScoringInputs already
 * expose as ScoringInputs.peakNumericValues. A candidate who disabled
 * enforcement for several real minutes and then restored it still shows
 * a nonzero peak exposure in the completed attempt's scoring, never
 * silently erased by reverting.
 *
 * ── ALTERNATE STRONG PATHS (three independently viable, all reach a
 * safe handback with abuse protection intact) ──────────────────────────
 *   1. Targeted rollback: detectionRuleVersion = "v1-stable" — reverts
 *      to the last known-good rule, available immediately.
 *   2. Patched forward-fix: detectionRuleVersion = "v3-patched" —
 *      requires real elapsed investigation time (patchedRuleAvailable).
 *   3. Temporary exemption: falsePositiveExemption =
 *      "exempt-flagged-legit" WITH identityTrustScoring = "enabled" —
 *      restores the specifically-flagged legitimate population without
 *      touching the detection rule at all, available immediately.
 * All three keep abuseTrafficBlock's independent abuse-specific
 * screening fully intact and never set rateLimiterMode away from
 * "strict" — none is a "preferred author answer" shadowing the others;
 * all three are genuinely, independently safe.
 */
export const abusePreventionFalsePositiveStormRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE SECURITY TRAPS — checked first, win regardless of every
  // other control. These are the required tempting-but-unsafe
  // availability-maximizing paths: legitimate-user availability
  // genuinely improves while a real, growing abuse-exposure violation
  // accrues for as long as the lever stays active.
  // ══════════════════════════════════════════════════════════════════

  // Global disablement, with investigation already having produced a
  // patched rule option: the single most-escalated reachable state —
  // availability looks its absolute healthiest (no false positives, no
  // throttling) while the historical exposure count is at its highest,
  // since this is reachable only after the longest possible elapsed
  // exposure window. Listed BEFORE the sustained-only variant below
  // (patchedRuleAvailable implies sustainedFalsePositives in this
  // scenario's authored timeline — see timed-events.ts — so the more
  // specific/later trigger state must come first or it would be
  // permanently shadowed by the next rule down).
  {
    id: "rate-limiter-disabled-during-investigation",
    when: {
      triggerEquals: { patchedRuleAvailable: true },
      controlEquals: { [RATE_LIMITER_MODE_KEY]: "disabled" },
    },
    incidentState: "rate-limiter-disabled-during-investigation",
    values: {
      legitimateUserSuccessRate: 99.7,
      legitimateUsersBlockedCount: 0,
      abuseRequestsAllowedRate: 41,
      cumulativeAbuseRequestsAllowedCount: 3_100,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "disabled",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: bypassedHealth,
  },
  // Global disablement, sustained window (not yet at the investigation
  // milestone): still the worst reachable state at this point, but a
  // real, distinct, lower historical count than the investigation-era
  // state above — proving the count genuinely compounds with elapsed
  // exposure time, not a fixed one-time cost. Listed before the
  // non-sustained variant (sustainedFalsePositives implies
  // falsePositivesActive, so the more specific rule must come first or
  // it would be permanently shadowed).
  {
    id: "rate-limiter-disabled-sustained",
    when: {
      triggerEquals: { falsePositivesActive: true, sustainedFalsePositives: true },
      controlEquals: { [RATE_LIMITER_MODE_KEY]: "disabled" },
    },
    incidentState: "rate-limiter-disabled-sustained",
    values: {
      legitimateUserSuccessRate: 99.6,
      legitimateUsersBlockedCount: 0,
      abuseRequestsAllowedRate: 46,
      cumulativeAbuseRequestsAllowedCount: 2_400,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "disabled",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: bypassedHealth,
  },
  {
    id: "rate-limiter-disabled",
    when: {
      triggerEquals: { falsePositivesActive: true },
      controlEquals: { [RATE_LIMITER_MODE_KEY]: "disabled" },
    },
    incidentState: "rate-limiter-disabled",
    values: {
      legitimateUserSuccessRate: 99.5,
      legitimateUsersBlockedCount: 0,
      abuseRequestsAllowedRate: 38,
      cumulativeAbuseRequestsAllowedCount: 640,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "disabled",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: bypassedHealth,
  },

  // Partial relaxation, sustained: a smaller blast radius than global
  // disablement, but the SAME kind of violation — real, nonzero,
  // counted abuse exposure, for as long as it stays active.
  {
    id: "rate-limiter-relaxed-sustained",
    when: {
      triggerEquals: { falsePositivesActive: true, sustainedFalsePositives: true },
      controlEquals: { [RATE_LIMITER_MODE_KEY]: "relaxed" },
    },
    incidentState: "rate-limiter-relaxed-sustained",
    values: {
      legitimateUserSuccessRate: 94,
      legitimateUsersBlockedCount: 180,
      abuseRequestsAllowedRate: 19,
      cumulativeAbuseRequestsAllowedCount: 980,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "relaxed",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: bypassedHealth,
  },
  {
    id: "rate-limiter-relaxed",
    when: {
      triggerEquals: { falsePositivesActive: true },
      controlEquals: { [RATE_LIMITER_MODE_KEY]: "relaxed" },
    },
    incidentState: "rate-limiter-relaxed",
    values: {
      legitimateUserSuccessRate: 91,
      legitimateUsersBlockedCount: 260,
      abuseRequestsAllowedRate: 14,
      cumulativeAbuseRequestsAllowedCount: 260,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "relaxed",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: bypassedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // INDEPENDENT ABUSE-SIGNAL REMOVED — abuseTrafficBlock is a SEPARATE
  // mechanism from the faulty detection rule and from rateLimiterMode.
  // Turning it off lets real abuse through even while enforcement is
  // otherwise "strict" and the rate limiter is never disabled — proof
  // this is a genuinely independent axis, not a dead control.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "abuse-signal-disabled-strict-limiter",
    when: {
      triggerEquals: { falsePositivesActive: true },
      controlEquals: {
        [ABUSE_TRAFFIC_BLOCK_KEY]: "inactive",
        [RATE_LIMITER_MODE_KEY]: "strict",
      },
    },
    incidentState: "abuse-signal-disabled",
    values: {
      legitimateUserSuccessRate: 62,
      legitimateUsersBlockedCount: 1_250,
      abuseRequestsAllowedRate: 9,
      cumulativeAbuseRequestsAllowedCount: 180,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: falsePositiveHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNRELIABLE EXEMPTION TRAP — granting the exemption without a live
  // trust signal cannot reliably distinguish a real false positive from
  // a real abuser hiding in the same flagged population. Genuinely
  // unsafe differentiation, even though no bypass lever was touched.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "exemption-without-trust-scoring-unreliable",
    when: {
      triggerEquals: { falsePositivesActive: true },
      controlEquals: {
        [FALSE_POSITIVE_EXEMPTION_KEY]: "exempt-flagged-legit",
        [IDENTITY_TRUST_SCORING_KEY]: "disabled",
      },
    },
    incidentState: "exemption-unreliable",
    values: {
      legitimateUserSuccessRate: 88,
      legitimateUsersBlockedCount: 310,
      abuseRequestsAllowedRate: 6,
      cumulativeAbuseRequestsAllowedCount: 95,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "protection-bypassed",
    },
    componentHealth: unreliableExemptionHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE TARGETED-FIX FAMILY — the scenario's three genuinely
  // safe alternate strong paths. In every one, abuseTrafficBlock stays
  // "active" (real abuse screening intact) and rateLimiterMode stays
  // "strict" (no broad bypass) — the ONLY thing that changes is how
  // the false-positive population specifically gets relief.
  // ══════════════════════════════════════════════════════════════════

  // OPTIMAL path 1: targeted rollback to the last known-good rule
  // version. Available immediately (no elapsed-time gate) — the
  // fastest genuinely safe resolution.
  {
    id: "targeted-rollback-fixed",
    when: {
      triggerEquals: { falsePositivesActive: true },
      controlEquals: {
        [DETECTION_RULE_VERSION_KEY]: "v1-stable",
        [RATE_LIMITER_MODE_KEY]: "strict",
        [ABUSE_TRAFFIC_BLOCK_KEY]: "active",
      },
    },
    incidentState: "targeted-rollback-fixed",
    values: {
      legitimateUserSuccessRate: 99.4,
      legitimateUsersBlockedCount: 0,
      abuseRequestsAllowedRate: 0.5,
      cumulativeAbuseRequestsAllowedCount: 0,
      detectionRuleStatus: "stable",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "fully-restored",
    },
    componentHealth: healthyHealth,
  },

  // OPTIMAL path 2: patched forward-fix. Only reachable once real
  // investigation time has elapsed (patchedRuleAvailable) — a
  // candidate who sets this value before investigation has produced a
  // real patch is NOT matched by this rule (no trigger yet), and falls
  // through to the plain baseline/targeted-fix-unavailable rule below,
  // proving the forward-fix is not instantly available on demand.
  {
    id: "patched-forward-fix",
    when: {
      triggerEquals: { patchedRuleAvailable: true },
      controlEquals: {
        [DETECTION_RULE_VERSION_KEY]: "v3-patched",
        [RATE_LIMITER_MODE_KEY]: "strict",
        [ABUSE_TRAFFIC_BLOCK_KEY]: "active",
      },
    },
    incidentState: "patched-forward-fix",
    values: {
      legitimateUserSuccessRate: 99.6,
      legitimateUsersBlockedCount: 0,
      abuseRequestsAllowedRate: 0.4,
      cumulativeAbuseRequestsAllowedCount: 0,
      detectionRuleStatus: "stable",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "fully-restored",
    },
    componentHealth: healthyHealth,
  },

  // ACCEPTABLE path 3: temporary exemption for the identified
  // false-positive population, backed by a live trust signal, WHILE
  // the bad rule is still technically live and investigation
  // continues. Genuinely safe (real abuse screening and the
  // independent abuse signal are both intact) but intentionally
  // incomplete — the underlying rule defect has not yet been fixed,
  // so this is a deliberate bounded tradeoff, not full resolution.
  {
    id: "exemption-with-trust-scoring-safe",
    when: {
      triggerEquals: { falsePositivesActive: true },
      controlEquals: {
        [FALSE_POSITIVE_EXEMPTION_KEY]: "exempt-flagged-legit",
        [IDENTITY_TRUST_SCORING_KEY]: "enabled",
        [RATE_LIMITER_MODE_KEY]: "strict",
        [ABUSE_TRAFFIC_BLOCK_KEY]: "active",
      },
    },
    incidentState: "exemption-safe",
    values: {
      legitimateUserSuccessRate: 97,
      legitimateUsersBlockedCount: 30,
      abuseRequestsAllowedRate: 0.5,
      cumulativeAbuseRequestsAllowedCount: 0,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "targeted-fix-applied",
    },
    componentHealth: targetedFixHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING — rollout not yet addressed, sustained window reached.
  // Strictly worse than the non-sustained baseline at the same point
  // (more legitimate users accumulate into the blocked population the
  // longer the bad rule stays live with no action taken).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "false-positives-sustained-unaddressed",
    when: { triggerEquals: { falsePositivesActive: true, sustainedFalsePositives: true } },
    incidentState: "false-positives-sustained-unaddressed",
    values: {
      legitimateUserSuccessRate: 58,
      legitimateUsersBlockedCount: 2_100,
      abuseRequestsAllowedRate: 0.5,
      cumulativeAbuseRequestsAllowedCount: 0,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "false-positives-active",
    },
    componentHealth: falsePositiveHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — false positives active, no meaningful action taken yet.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "false-positives-baseline",
    when: { triggerEquals: { falsePositivesActive: true } },
    incidentState: "false-positives-baseline",
    values: {
      legitimateUserSuccessRate: 64,
      legitimateUsersBlockedCount: 820,
      abuseRequestsAllowedRate: 0.5,
      cumulativeAbuseRequestsAllowedCount: 0,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "false-positives-active",
    },
    componentHealth: falsePositiveHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      legitimateUserSuccessRate: 99.5,
      legitimateUsersBlockedCount: 0,
      abuseRequestsAllowedRate: 0.5,
      cumulativeAbuseRequestsAllowedCount: 0,
      detectionRuleStatus: "faulty",
      rateLimiterStatus: "normal",
      abuseProtectionStatus: "false-positives-active",
    },
    componentHealth: healthyHealth,
  },
];
