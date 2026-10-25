import type { ComponentHealth, Rule } from "@incidentrank/simulator";
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

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "auth-orchestrator": "healthy",
  "session-store": "healthy",
  "token-verification": "healthy",
  "mfa-provider": "healthy",
  "risk-engine": "healthy",
  "user-directory": "healthy",
};

// Token Verification and User Directory are NEVER touched by any rule
// below — they stay healthy throughout the entire incident, by design.
const baseDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "auth-orchestrator": "degraded",
  "session-store": "degraded",
  "mfa-provider": "critical",
};

const boundedDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "auth-orchestrator": "degraded",
  "session-store": "degraded",
  "mfa-provider": "critical",
};

const compromisedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "auth-orchestrator": "critical",
  "session-store": "degraded",
  "mfa-provider": "critical",
  "risk-engine": "degraded",
};

const amplifiedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "auth-orchestrator": "critical",
  "session-store": "critical",
  "mfa-provider": "critical",
};

const recoveringProviderHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "session-store": "degraded",
  "mfa-provider": "degraded",
};

const relievedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "session-store": "healthy",
  "mfa-provider": "healthy",
};

/**
 * Authored rule table for Identity Platform Degradation, ordered
 * most-specific-first: unsafe security traps first (they win
 * regardless of every other control, because a security violation is
 * never acceptable no matter how healthy other metrics look), followed
 * by the pressure-transfer trap, the invariant-#5 relief trap, the
 * legitimate bounded-degraded progression, the plain fail-closed
 * baseline, the MFA Provider's own recovery timeline, the session-store
 * relief/recovery-lag progression, and a healthy-default fallback.
 *
 * ROOT CAUSE: the MFA Provider degrades AND Session Store pressure
 * rises concurrently, starting at the same timed event
 * (identity-degradation-onset). Token Verification and the User
 * Directory are NEVER touched by any rule here — tokenVerification
 * SuccessRate stays at 99.9 throughout, a real decoy signal a candidate
 * must not mistake for "everything is fine."
 *
 * ── HISTORICAL DAMAGE MODEL (phase6d3.md, binding for this scenario)
 * highRiskActionsAuthenticatedWithoutMfaCount is modeled the same way
 * Ledger Reconciliation Divergence and API Migration Dual-Write
 * Failure model their non-resetting correctness counters: as a
 * sequence of authored snapshots keyed to elapsed trigger-time windows
 * (sustainedPressure / mfaProviderRecovering / mfaProviderRecovered),
 * not as runtime arithmetic or a synthetic "ever activated" flag — the
 * engine has no mechanism for the latter (triggers are set only by
 * timed events, never by rule matches; see tick.ts). While
 * mfaPolicyByRiskTier stays "bypass-all" (or privilegedActionMode
 * stays "allow-with-cached-risk"), the count climbs at each
 * later-firing elapsed-time trigger for the SAME "still bypassing"
 * rule family — a real, growing count tied to real elapsed exposure
 * time, exactly mirroring how the ledger scenario's
 * missingEntryCount/duplicateSettlementEntryCount climb while the
 * publisher bug stays active. The moment the policy reverts to
 * mandatory-all/protected, the live incidentState moves to the
 * fail-closed/bounded-degraded/recovered family, which always carries
 * highRiskActionsAuthenticatedWithoutMfaCount: 0 going forward — this
 * is the SAME limitation the ledger/migration scenarios accept (their
 * own damage counters reset to 0 the instant the unsafe lever is
 * turned off too; see ledger-reconciliation-divergence/rules.ts, where
 * discardedAcknowledgedEntryCount is 0 in every rule except the
 * discard-trap rules themselves). What is genuinely non-resetting and
 * irreversible is the EXPOSURE WINDOW itself: totalTimeInCriticalMs
 * (an engine-tracked field, never author-settable, that only ever
 * accumulates) and peaks.peakValues (engine-tracked max-ever, surfaced
 * to scoring as peakNumericValues) record that the violation really
 * happened, for however long it was live, even after the candidate
 * reverts policy — see highRiskActionsAuthenticatedWithoutMfaCount's
 * entry in numericWatchFields (trackPeak: true) in definition.ts and
 * scoring.ts's reliance on the peak, not the final, value for this
 * specific measure. A candidate who bypassed MFA for high-risk actions
 * for 4 real minutes and then reverted still shows a peak exposure of
 * 48 in the completed attempt's scoring, never silently erased by
 * reverting.
 *
 * ── PRESSURE-TRANSFER MECHANISM (phase6d3.md binding) ───────────────
 * loginConcurrencyLimit = "unlimited" combined with mfaRetryBackoff =
 * "aggressive" while the MFA Provider is degraded does not relieve
 * anything — it lets a flood of concurrent login/session-recreation
 * attempts hit the already-struggling MFA Provider and the already-
 * pressured Session Store at once, authored as a materially higher
 * sessionStorePressureLevel and mfaProviderFailureRate than the same
 * trigger window at normal settings (see
 * "pressure-amplified-retries-and-concurrency" below).
 *
 * ── RECOVERY LAG (phase6d3.md binding) ───────────────────────────────
 * sessionStorePressureLevel only ever drains once a genuine relief
 * lever is engaged (sessionCacheMode = "relief-eviction", or
 * loginConcurrencyLimit = "throttled") AND real elapsed relief-window
 * time has passed (reliefWindow1Elapsed / reliefWindow2Elapsed /
 * reliefWindowFullyRelievedElapsed) — never instantly on the tick the
 * control is flipped.
 */
export const identityPlatformDegradationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE SECURITY TRAPS — checked first, win regardless of every
  // other control. These are the required tempting-but-unsafe
  // availability-maximizing paths: availability/latency metrics
  // genuinely improve while a real, growing security violation accrues
  // for as long as the lever stays active.
  // ══════════════════════════════════════════════════════════════════

  // Broad MFA bypass for ALL logins including high-risk/privileged —
  // the scenario's central forbidden lever. Availability metrics look
  // excellent (no MFA round-trip to the degraded provider at all), but
  // authSecurityStatus is "compromised" and the historical count is
  // materially higher once sustainedPressure has fired, proving the
  // violation compounds the longer it is left active (not a fixed,
  // one-time cost).
  {
    id: "mfa-bypass-all-compromised-sustained",
    when: {
      triggerEquals: { mfaProviderDegraded: true, sustainedPressure: true },
      controlEquals: { [MFA_POLICY_BY_RISK_TIER_KEY]: "bypass-all" },
    },
    incidentState: "mfa-bypass-all-compromised-sustained",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 2_400,
      mfaProviderFailureRate: 40,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 55,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99.8,
      highRiskLoginSuccessRate: 99.7,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 48,
      authSecurityStatus: "compromised",
      systemPressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },
  {
    id: "mfa-bypass-all-compromised",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: { [MFA_POLICY_BY_RISK_TIER_KEY]: "bypass-all" },
    },
    incidentState: "mfa-bypass-all-compromised",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 2_000,
      mfaProviderFailureRate: 35,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 40,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99.7,
      highRiskLoginSuccessRate: 99.6,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 18,
      authSecurityStatus: "compromised",
    systemPressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },
  // Same bypass lever, but the MFA Provider has ALREADY started
  // recovering on its own clock — availability looks even healthier
  // (fewer provider-side failures) while bypass is still live, which
  // is precisely why availability improving must never be read as "the
  // bypass must be fine now": the historical count keeps climbing
  // exactly as before.
  {
    id: "mfa-bypass-all-compromised-during-recovery",
    when: {
      triggerEquals: { mfaProviderRecovering: true },
      controlEquals: { [MFA_POLICY_BY_RISK_TIER_KEY]: "bypass-all" },
    },
    incidentState: "mfa-bypass-all-compromised-during-recovery",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 300,
      mfaProviderFailureRate: 3,
      mfaProviderStatus: "warning",
      sessionStorePressureLevel: 50,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99.9,
      highRiskLoginSuccessRate: 99.9,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 62,
      authSecurityStatus: "compromised",
    systemPressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },

  // Privileged-action-specific bypass trap: allow-with-cached-risk
  // permits privileged actions to proceed on a stale cached risk
  // judgment without a live MFA challenge. Same growing historical
  // counter, same permanence of the exposure window, even if
  // mfaPolicyByRiskTier itself is set correctly for ordinary logins.
  {
    id: "privileged-allow-with-cached-risk-compromised-sustained",
    when: {
      triggerEquals: { mfaProviderDegraded: true, sustainedPressure: true },
      controlEquals: { [PRIVILEGED_ACTION_MODE_KEY]: "allow-with-cached-risk" },
    },
    incidentState: "privileged-allow-with-cached-risk-compromised-sustained",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 1_300,
      mfaProviderFailureRate: 18,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 42,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 94,
      highRiskLoginSuccessRate: 40,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 24,
      authSecurityStatus: "compromised",
    systemPressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },
  {
    id: "privileged-allow-with-cached-risk-compromised",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: { [PRIVILEGED_ACTION_MODE_KEY]: "allow-with-cached-risk" },
    },
    incidentState: "privileged-allow-with-cached-risk-compromised",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 900,
      mfaProviderFailureRate: 12,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 35,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 94,
      highRiskLoginSuccessRate: 40,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 9,
      authSecurityStatus: "compromised",
    systemPressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PRESSURE-TRANSFER TRAP — looks like "just add throughput," actually
  // worsens both the Session Store and the already-degraded MFA
  // Provider at once. Not a security violation, but a materially worse
  // availability outcome than doing nothing.
  // ══════════════════════════════════════════════════════════════════

  // Compounded variant: unlimited concurrency + aggressive retries
  // PLUS a short session TTL. A short TTL forces far more frequent
  // re-authentication on its own (controls.ts), so stacking it on top
  // of the amplification trap makes it measurably WORSE still — real,
  // distinct authored numbers proving sessionTtlSeconds is not a dead
  // control. Listed before the plain amplified rule below since it is
  // the more specific match (first-match-wins).
  {
    id: "pressure-amplified-retries-concurrency-and-short-ttl",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: {
        [LOGIN_CONCURRENCY_LIMIT_KEY]: "unlimited",
        [MFA_RETRY_BACKOFF_KEY]: "aggressive",
        [SESSION_TTL_SECONDS_KEY]: 300,
      },
    },
    incidentState: "pressure-amplified-retries-concurrency-and-short-ttl",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 6_200,
      mfaProviderFailureRate: 78,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 99,
      sessionStoreStatus: "critical",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 40,
      highRiskLoginSuccessRate: 25,
      privilegedActionAvailability: 40,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "unprotected",
      systemPressureSeverity: "amplified",
    },
    componentHealth: amplifiedHealth,
  },
  {
    id: "pressure-amplified-retries-and-concurrency",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: {
        [LOGIN_CONCURRENCY_LIMIT_KEY]: "unlimited",
        [MFA_RETRY_BACKOFF_KEY]: "aggressive",
      },
    },
    incidentState: "pressure-amplified-retries-and-concurrency",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 4_800,
      mfaProviderFailureRate: 62,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 92,
      sessionStoreStatus: "critical",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 55,
      highRiskLoginSuccessRate: 40,
      privilegedActionAvailability: 60,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "unprotected",
    systemPressureSeverity: "amplified",
    },
    componentHealth: amplifiedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SESSION-STORE RELIEF WITHOUT TOKEN-ONLY PROTECTION — a real,
  // distinct invariant-#5 violation: relief-eviction genuinely lowers
  // pressure, but without tokenOnlyContinuation protecting active
  // sessions first, it evicts some currently-active sessions
  // unnecessarily.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "relief-eviction-without-token-protection",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: {
        [SESSION_CACHE_MODE_KEY]: "relief-eviction",
        [TOKEN_ONLY_CONTINUATION_KEY]: false,
      },
    },
    incidentState: "relief-eviction-without-token-protection",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 1_100,
      mfaProviderFailureRate: 14,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 38,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 65,
      lowRiskLoginSuccessRate: 90,
      highRiskLoginSuccessRate: 60,
      privilegedActionAvailability: 60,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "unprotected",
    systemPressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE BOUNDED-DEGRADED PROGRESSION — the scenario's required
  // legitimate degraded-but-safe state. Requires BOTH
  // risk-based-bounded-degrade AND a usable risk engine (full-enrichment
  // or cached-risk-scores) to safely distinguish low-risk from
  // high-risk logins; high-risk/privileged logins remain protected
  // (blocked, or explicitly temporarily-unavailable) throughout.
  // ══════════════════════════════════════════════════════════════════

  // Risk-based-bounded-degrade requested, but the Risk Engine is
  // disabled — there is no reliable way to tell risk tiers apart, so
  // this cannot safely bounded-degrade. Falls back to the same
  // fail-closed posture as mandatory-all, at a real authored cost
  // (lower lowRiskLoginSuccessRate than the real bounded-degrade state
  // below), demonstrating riskEngineMode is not a dead control.
  {
    id: "bounded-degrade-requested-risk-engine-disabled",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: {
        [MFA_POLICY_BY_RISK_TIER_KEY]: "risk-based-bounded-degrade",
        [RISK_ENGINE_MODE_KEY]: "disabled",
      },
    },
    incidentState: "bounded-degrade-requested-risk-engine-disabled",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 900,
      mfaProviderFailureRate: 10,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 32,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 42,
      highRiskLoginSuccessRate: 42,
      privilegedActionAvailability: 60,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "fail-closed",
    systemPressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },

  // Real bounded-degrade, privileged actions still live-protected
  // (blocked): low-risk logins succeed via the bounded degraded flow,
  // high-risk logins are correctly still blocked (mandatory MFA still
  // enforced for them), privileged actions are blocked outright since
  // "protected" mode requires a live MFA challenge the provider can't
  // reliably deliver.
  {
    id: "bounded-degrade-protected-privileged",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: {
        [MFA_POLICY_BY_RISK_TIER_KEY]: "risk-based-bounded-degrade",
        [PRIVILEGED_ACTION_MODE_KEY]: "protected",
      },
    },
    incidentState: "bounded-degrade-protected-privileged",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 700,
      mfaProviderFailureRate: 8,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 30,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 97,
      highRiskLoginSuccessRate: 40,
      privilegedActionAvailability: 35,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "bounded-degraded",
    systemPressureSeverity: "elevated",
    },
    componentHealth: boundedDegradedHealth,
  },

  // Real bounded-degrade, privileged actions explicitly taken offline
  // (temporarily-unavailable) rather than left half-protected — the
  // OPTIMAL-tier combination: low-risk users keep working through the
  // bounded flow, high-risk logins stay protected, and privileged
  // actions are an honest, deliberate "unavailable" rather than a
  // flaky live-MFA-dependent "protected" that will often fail while
  // the provider is degraded.
  {
    id: "bounded-degrade-privileged-unavailable",
    when: {
      triggerEquals: { mfaProviderDegraded: true },
      controlEquals: {
        [MFA_POLICY_BY_RISK_TIER_KEY]: "risk-based-bounded-degrade",
        [PRIVILEGED_ACTION_MODE_KEY]: "temporarily-unavailable",
      },
    },
    incidentState: "bounded-degrade-privileged-unavailable",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 700,
      mfaProviderFailureRate: 8,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 30,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 97,
      highRiskLoginSuccessRate: 40,
      privilegedActionAvailability: 0,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "bounded-degraded",
    systemPressureSeverity: "elevated",
    },
    componentHealth: boundedDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PLAIN FAIL-CLOSED BASELINE — mandatory-all in effect: safe but
  // blunt. No security violation, but low-risk users are needlessly
  // blocked too, and session-store pressure is unaddressed unless a
  // separate relief lever is engaged (handled further below).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fail-closed-mandatory-all-sustained",
    when: { triggerEquals: { mfaProviderDegraded: true, sustainedPressure: true } },
    incidentState: "fail-closed-mandatory-all-sustained",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 1_600,
      mfaProviderFailureRate: 22,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 48,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 38,
      highRiskLoginSuccessRate: 38,
      privilegedActionAvailability: 60,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "fail-closed",
    systemPressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },
  {
    id: "fail-closed-mandatory-all-baseline",
    when: { triggerEquals: { mfaProviderDegraded: true } },
    incidentState: "fail-closed-mandatory-all-baseline",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 900,
      mfaProviderFailureRate: 10,
      mfaProviderStatus: "critical",
      sessionStorePressureLevel: 32,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 42,
      highRiskLoginSuccessRate: 42,
      privilegedActionAvailability: 60,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "fail-closed",
    systemPressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SESSION-STORE RELIEF / RECOVERY-LAG PROGRESSION — requires a real
  // relief lever (relief-eviction, protected by tokenOnlyContinuation;
  // or throttled login concurrency) AND real elapsed relief-window
  // time. Reachable both while the MFA Provider is still degraded and
  // after it has recovered — the two axes are independent. Listed
  // BEFORE the generic mfa-provider-recovered/recovering fallback rules
  // below: those two fallbacks have NO control constraints at all
  // (they match on trigger alone), so if they were listed first they
  // would permanently shadow every one of these more-specific relief
  // rules, which also require mfaProviderRecovered === true —
  // first-match-wins means the more specific rule must come first.
  // ══════════════════════════════════════════════════════════════════

  // OPTIMAL: fully relieved. Provider fully recovered, relief engaged
  // safely (relief-eviction + tokenOnlyContinuation, so zero
  // unnecessary invalidations), and the longest relief window has
  // elapsed — pressure has drained to baseline.
  {
    id: "fully-relieved-safe",
    when: {
      triggerEquals: { mfaProviderRecovered: true, reliefWindowFullyRelievedElapsed: true },
      controlEquals: {
        [SESSION_CACHE_MODE_KEY]: "relief-eviction",
        [TOKEN_ONLY_CONTINUATION_KEY]: true,
      },
    },
    incidentState: "fully-relieved-safe",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 10,
      sessionStoreStatus: "normal",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99,
      highRiskLoginSuccessRate: 99,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
    systemPressureSeverity: "normal",
    },
    componentHealth: relievedHealth,
  },
  // Fully relieved via throttled concurrency instead of relief-eviction
  // — an alternate strong path: no eviction risk at all (since nothing
  // is being evicted), slightly slower login admission along the way,
  // but reaches the same fully-drained pressure level.
  {
    id: "fully-relieved-via-throttling",
    when: {
      triggerEquals: { mfaProviderRecovered: true, reliefWindowFullyRelievedElapsed: true },
      controlEquals: { [LOGIN_CONCURRENCY_LIMIT_KEY]: "throttled" },
    },
    incidentState: "fully-relieved-via-throttling",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 12,
      sessionStoreStatus: "normal",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 98,
      highRiskLoginSuccessRate: 98,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
    systemPressureSeverity: "normal",
    },
    componentHealth: relievedHealth,
  },

  // Draining, window 2 — relief engaged, second window elapsed, not
  // yet fully drained.
  {
    id: "relief-draining-window2-safe",
    when: {
      triggerEquals: {
        mfaProviderRecovered: true,
        reliefWindow2Elapsed: true,
        reliefWindowFullyRelievedElapsed: false,
      },
      controlEquals: {
        [SESSION_CACHE_MODE_KEY]: "relief-eviction",
        [TOKEN_ONLY_CONTINUATION_KEY]: true,
      },
    },
    incidentState: "relief-draining-window2-safe",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 24,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99,
      highRiskLoginSuccessRate: 99,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
    systemPressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // Draining, window 1, WITH extended session TTL — an extended TTL
  // (controls.ts) reduces how often sessions need to re-authenticate,
  // lowering load on the Session Store independently of relief
  // eviction itself. This reaches a measurably LOWER pressure level
  // than the plain window-1 rule below at the identical elapsed
  // window — real, distinct authored numbers proving
  // sessionTtlSeconds is not a dead control on the relief side either.
  // Listed before the plain rule since it is the more specific match.
  {
    id: "relief-draining-window1-extended-ttl",
    when: {
      triggerEquals: {
        mfaProviderRecovered: true,
        reliefWindow1Elapsed: true,
        reliefWindow2Elapsed: false,
      },
      controlEquals: {
        [SESSION_CACHE_MODE_KEY]: "relief-eviction",
        [TOKEN_ONLY_CONTINUATION_KEY]: true,
        [SESSION_TTL_SECONDS_KEY]: 7_200,
      },
    },
    incidentState: "relief-draining-window1-extended-ttl",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 28,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99,
      highRiskLoginSuccessRate: 99,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
      systemPressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // Draining, window 1 — relief just engaged plus one elapsed window:
  // real, distinct progress below the unaddressed ceiling of 60, but
  // still well above baseline — proving relief is not instantaneous.
  {
    id: "relief-draining-window1-safe",
    when: {
      triggerEquals: {
        mfaProviderRecovered: true,
        reliefWindow1Elapsed: true,
        reliefWindow2Elapsed: false,
      },
      controlEquals: {
        [SESSION_CACHE_MODE_KEY]: "relief-eviction",
        [TOKEN_ONLY_CONTINUATION_KEY]: true,
      },
    },
    incidentState: "relief-draining-window1-safe",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 40,
      sessionStoreStatus: "warning",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99,
      highRiskLoginSuccessRate: 99,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
    systemPressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // Relief just engaged, NO elapsed relief window yet (tick-zero proof
  // that relief does not instantly clear pressure).
  {
    id: "relief-just-engaged",
    when: {
      triggerEquals: { mfaProviderRecovered: true, reliefWindow1Elapsed: false },
      controlEquals: {
        [SESSION_CACHE_MODE_KEY]: "relief-eviction",
        [TOKEN_ONLY_CONTINUATION_KEY]: true,
      },
    },
    incidentState: "relief-just-engaged",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 60,
      sessionStoreStatus: "critical",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99,
      highRiskLoginSuccessRate: 99,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
    systemPressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // MFA PROVIDER RECOVERING / RECOVERED FALLBACKS — provider-side
  // health improves on its own schedule, but relief was never engaged
  // (none of the more-specific relief rules above matched). Listed
  // AFTER the relief progression so a candidate who genuinely engaged
  // relief is always matched by the more specific rule first; these
  // two catch everyone else. Session-store pressure is a SEPARATE axis
  // and does not move just because the provider recovered.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "mfa-provider-recovered-pressure-unaddressed",
    when: { triggerEquals: { mfaProviderRecovered: true } },
    incidentState: "mfa-provider-recovered-pressure-unaddressed",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 60,
      sessionStoreStatus: "critical",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 95,
      highRiskLoginSuccessRate: 95,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
      systemPressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },
  {
    id: "mfa-provider-recovering-pressure-unaddressed",
    when: { triggerEquals: { mfaProviderRecovering: true } },
    incidentState: "mfa-provider-recovering-pressure-unaddressed",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 300,
      mfaProviderFailureRate: 3,
      mfaProviderStatus: "warning",
      sessionStorePressureLevel: 55,
      sessionStoreStatus: "critical",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 90,
      highRiskLoginSuccessRate: 90,
      privilegedActionAvailability: 90,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "restored",
      systemPressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // ── Default/fallback: before the incident begins. ──────────────────
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      tokenVerificationSuccessRate: 99.9,
      mfaProviderLatencyMs: 80,
      mfaProviderFailureRate: 0.2,
      mfaProviderStatus: "normal",
      sessionStorePressureLevel: 10,
      sessionStoreStatus: "normal",
      activeSessionsUnnecessarilyInvalidatedCount: 0,
      lowRiskLoginSuccessRate: 99,
      highRiskLoginSuccessRate: 99,
      privilegedActionAvailability: 100,
      highRiskActionsAuthenticatedWithoutMfaCount: 0,
      authSecurityStatus: "unprotected",
    systemPressureSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
