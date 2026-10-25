import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "authorization-layer": "healthy",
  "policy-store": "healthy",
  "resource-metadata": "healthy",
  "cache-distribution": "healthy",
};

const unconvergedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "authorization-layer": "degraded",
  "cache-distribution": "critical",
};

const staleGrantActiveHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "authorization-layer": "critical",
  "cache-distribution": "critical",
  "policy-store": "degraded",
};

const convergingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "authorization-layer": "degraded",
  "cache-distribution": "degraded",
};

const safeDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "authorization-layer": "degraded",
  "policy-store": "degraded",
};

// Resource Metadata is NEVER touched by any rule below — it stays
// healthy and its implied read path stays unaffected throughout the
// entire incident, by design. It is a real decoy node: a candidate
// watching it for a signal will see nothing wrong, because the defect
// is specifically in privilege-cache convergence, not in resource
// lookup.

/**
 * Authored rule table for Privilege Escalation via Stale Authorization
 * Cache, ordered most-specific-first across the ENTIRE table (first-
 * match-wins): unsafe security traps, then the broad-trust-all
 * re-admission trap, then the active-convergence progression (recovery
 * lag, verified), then the passive-TTL-only convergence progression,
 * then the assumed-converged sequencing trap, then the legitimate
 * safe-degraded tradeoff, then the plain fail-closed baseline (the
 * LEAST specific non-fallback rule — it matches on `privilegeRevoked`
 * alone with no control constraint, so every rule above it that
 * requires a later-firing trigger or a specific control value MUST be
 * listed before it, or it would permanently shadow them), then the
 * healthy-default fallback.
 *
 * ROOT CAUSE: a privilege is revoked at the Policy Store (the source of
 * truth) at REVOCATION_ONSET_MS, but Cache Distribution has not yet
 * converged — a subset of cache instances still believe the privilege
 * is valid. This is a real cache-CONVERGENCE CORRECTNESS problem with
 * live security consequences: requestSuccessRate stays high (99.9)
 * throughout almost every reachable state in this scenario, including
 * the worst security violations, because this incident does not
 * present as an availability outage. Resource Metadata is never
 * touched — a real decoy signal.
 *
 * ── SECURITY INVARIANT (binding for every rule below) ────────────────
 * A request must never be granted access based on a privilege that has
 * already been revoked at the source, even if a stale cache instance
 * believes it is still valid. staleGrantRatePercent is 0 in EVERY rule
 * below except the explicit unsafe-trap family — never a side effect
 * of the revocation itself, only ever a consequence of an actual
 * candidate choice to trust unverified/stale cache state.
 *
 * ── HISTORICAL DAMAGE MODEL (binding, non-resetting) ──────────────────
 * cumulativeStalePrivilegeGrantCount only increases while a cache
 * instance is ACTUALLY serving the stale, already-revoked grant (the
 * fail-open family, or the broad-trust-all-plus-fail-open combination).
 * The moment the posture reverts to fail-closed, the live incidentState
 * moves to a family whose `values.cumulativeStalePrivilegeGrantCount`
 * authors 0 going forward — this live field answers "is a stale grant
 * happening RIGHT NOW," exactly mirroring Authorization Policy Rollout
 * Failure's cumulativeUnauthorizedAccessCount and Identity Platform
 * Degradation's highRiskActionsAuthenticatedWithoutMfaCount. What is
 * genuinely permanent and non-resetting is
 * state.peaks.peakValues.cumulativeStalePrivilegeGrantCount (a
 * numericWatchField with trackPeak:true in definition.ts) — the engine
 * computes this generically as Math.max(previousPeak, currentValue)
 * every tick regardless of which rule currently matches, so a candidate
 * who left fail-open active for real elapsed time and then reverted
 * still shows the real peak exposure in the completed attempt's
 * scoring, never silently erased by reverting. See scoring.ts's
 * reliance on this peak, and the test suite's explicit non-reset proof.
 *
 * ── TEMPTING UNSAFE PATH #1: fail-open (required) ─────────────────────
 * convergenceUncertaintyMode = "fail-open" grants access whenever ANY
 * cache instance says yes, without verifying convergence. Availability
 * metrics genuinely improve (requestSuccessRate stays at its ceiling,
 * zero false-denies from unconverged caches) — but this is exactly the
 * mechanism that lets the revoked privilege keep being honored, and
 * staleGrantRatePercent becomes real and nonzero for as long as it
 * stays active.
 *
 * ── TEMPTING UNSAFE PATH #2: broad-trust-all purge ────────────────────
 * cachePurgeScope = "broad-trust-all" is marketed as an instant
 * availability fix: a blanket flush-and-refill of the whole fleet. Each
 * instance refills from whatever it currently holds — including
 * instances that never converged — so it either RE-ADMITS the exact
 * stale grants it was supposed to clear (paired with fail-closed: a
 * real, measurable regression vs. doing nothing, authored below) or,
 * paired with fail-open, actively worsens the live security violation
 * (a compounded trap, authored below).
 *
 * ── SEQUENCING TRAP: assumed-converged vs. verified-converged ────────
 * convergenceVerification = "unverified" (default) means convergence
 * has never actually been confirmed — only assumed from elapsed time.
 * At PLAUSIBLE_BUT_UNVERIFIED_MS, enough time has passed that it is
 * tempting to broadly re-trust the cache layer, but a real, nonzero
 * minority of the fleet has NOT actually converged yet. Re-trusting
 * broadly here (by abandoning fail-closed before verification) risks a
 * real stale grant. convergenceVerification = "verify-before-trust"
 * requires a real convergence check against the Policy Store before
 * the Authorization Layer resumes broad trust — this is the scenario's
 * required sequencing discipline: verify BEFORE trusting broadly again,
 * never assume time alone proves convergence.
 *
 * ── RECOVERY LAG (binding) ────────────────────────────────────────────
 * cacheConvergencePercent only ever climbs once a genuine propagation
 * lever is engaged (cacheInvalidationMode = "immediate"/"forced", or
 * cachePurgeScope = "targeted") AND real elapsed convergence-window
 * time has passed — never instantly on the tick the control is
 * flipped. A slower passive-TTL-only path exists too (short
 * cacheTtlSeconds with no active push), proving cacheTtlSeconds is a
 * real accelerant, not a dead control.
 *
 * ── ALTERNATE STRONG PATHS (both independently reach OPTIMAL) ────────
 *   1. Push-based: cacheInvalidationMode = "immediate" (or "forced") +
 *      convergenceVerification = "verify-before-trust" + the full
 *      active convergence window elapsed.
 *   2. Targeted-purge-based: cachePurgeScope = "targeted" +
 *      convergenceVerification = "verify-before-trust" + the full
 *      active convergence window elapsed.
 * Both are authored to reach the identical converged-safe end state —
 * genuinely, independently viable, not a decoy vs a real answer. Both
 * are authored identically here (the rule's `when` only constrains
 * convergenceVerification + convergenceUncertaintyMode, never which
 * propagation lever was used) since "a real propagation lever was
 * engaged for the full window" is true regardless of WHICH lever
 * (cacheInvalidationMode or cachePurgeScope) the candidate chose —
 * exactly mirroring Authorization Policy Rollout Failure's
 * converged-safe-pinned/converged-safe-rolled-back pair reaching an
 * identical end state via two different source-fix levers.
 */
export const privilegeEscalationViaStaleAuthorizationCacheRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE SECURITY TRAPS — stale grants actively happening. Checked
  // first; win regardless of every other control.
  // ══════════════════════════════════════════════════════════════════

  // Fail-open, sustained unconverged window: the worst reachable state.
  {
    id: "fail-open-stale-grant-sustained",
    when: {
      triggerEquals: { privilegeRevoked: true, sustainedUnconverged: true },
      controlEquals: { [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-open" },
    },
    incidentState: "fail-open-stale-grant-sustained",
    values: {
      requestSuccessRate: 99.9,
      correctDenyRatePercent: 60,
      staleGrantRatePercent: 15,
      cacheConvergencePercent: 40,
      fleetCacheConvergenceStatus: "unverified",
      cumulativeStalePrivilegeGrantCount: 640,
      enforcementPosture: "fail-open",
      authorizationStatus: "stale-grant-active",
    },
    componentHealth: staleGrantActiveHealth,
  },
  // Fail-open while convergence has ALREADY climbed on its own (e.g.
  // after an invalidation push was engaged but the posture was never
  // reverted off fail-open) — availability/convergence metrics look
  // even healthier, which is precisely why "it looks better now" must
  // never be read as "the fail-open setting must be fine": the
  // historical count keeps climbing exactly as before, at a lower but
  // still real and nonzero rate. Listed BEFORE the plain
  // fail-open-stale-grant fallback below — convergenceWindow1Elapsed
  // is a more specific (later-firing) trigger than privilegeRevoked
  // alone, so first-match-wins requires this rule to come first or it
  // would be permanently shadowed.
  {
    id: "fail-open-stale-grant-during-convergence",
    when: {
      triggerEquals: { privilegeRevoked: true, convergenceWindow1Elapsed: true },
      controlEquals: { [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-open" },
    },
    incidentState: "fail-open-stale-grant-during-convergence",
    values: {
      requestSuccessRate: 99.9,
      correctDenyRatePercent: 92,
      staleGrantRatePercent: 3,
      cacheConvergencePercent: 70,
      fleetCacheConvergenceStatus: "unverified",
      cumulativeStalePrivilegeGrantCount: 240,
      enforcementPosture: "fail-open",
      authorizationStatus: "stale-grant-active",
    },
    componentHealth: staleGrantActiveHealth,
  },
  // ── broad-trust-all compounded with fail-open: the single worst
  // combination — the blanket refill actively re-admits stale grants
  // from never-converged instances, AND fail-open grants on top of
  // that with no verification at all. Strictly worse than fail-open
  // alone at an equivalent window. Listed BEFORE the plain
  // fail-open-stale-grant fallback below: this rule's control
  // constraint (cachePurgeScope AND convergenceUncertaintyMode) is
  // strictly MORE specific than the plain rule's (convergenceUncertaintyMode
  // alone), so first-match-wins requires it to come first or it would
  // be permanently shadowed.
  {
    id: "broad-trust-all-fail-open-compounded",
    when: {
      triggerEquals: { privilegeRevoked: true },
      controlEquals: {
        [CACHE_PURGE_SCOPE_KEY]: "broad-trust-all",
        [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-open",
      },
    },
    incidentState: "broad-trust-all-fail-open-compounded",
    values: {
      requestSuccessRate: 99.9,
      correctDenyRatePercent: 68,
      staleGrantRatePercent: 13,
      cacheConvergencePercent: 45,
      fleetCacheConvergenceStatus: "unverified",
      cumulativeStalePrivilegeGrantCount: 310,
      enforcementPosture: "fail-open",
      authorizationStatus: "stale-grant-active",
    },
    componentHealth: staleGrantActiveHealth,
  },
  {
    id: "fail-open-stale-grant",
    when: {
      triggerEquals: { privilegeRevoked: true },
      controlEquals: { [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-open" },
    },
    incidentState: "fail-open-stale-grant",
    values: {
      requestSuccessRate: 99.9,
      correctDenyRatePercent: 75,
      staleGrantRatePercent: 10,
      cacheConvergencePercent: 55,
      fleetCacheConvergenceStatus: "unverified",
      cumulativeStalePrivilegeGrantCount: 180,
      enforcementPosture: "fail-open",
      authorizationStatus: "stale-grant-active",
    },
    componentHealth: staleGrantActiveHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BROAD-TRUST-ALL RE-ADMISSION TRAP (fail-closed otherwise) — not a
  // live security violation (fail-closed is still enforced, so
  // staleGrantRatePercent stays 0), but the blanket flush-and-refill
  // re-admits whatever each instance currently holds, including
  // never-converged entries — a real, measurable REGRESSION in
  // convergence vs. simply doing nothing, proving broad-trust-all is a
  // trap even without fail-open.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "broad-trust-all-reintroduces-staleness",
    when: {
      triggerEquals: { privilegeRevoked: true },
      controlEquals: {
        [CACHE_PURGE_SCOPE_KEY]: "broad-trust-all",
        [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-closed",
      },
    },
    incidentState: "broad-trust-all-reintroduces-staleness",
    values: {
      requestSuccessRate: 98.0,
      correctDenyRatePercent: 60,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 20,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: unconvergedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ACTIVE-CONVERGENCE PROGRESSION (recovery lag, verified) — requires
  // convergenceVerification = "verify-before-trust" AND real elapsed
  // convergence-window time. Listed BEFORE the sequencing trap, the
  // safe-degraded tradeoff, and the plain fail-closed baseline below,
  // all three of which match on `privilegeRevoked` with either no
  // control constraint or a DIFFERENT control's constraint — none of
  // those three constrain convergenceVerification, so if they were
  // listed first they would permanently shadow every rule in this
  // block once their own (less specific) trigger/control combination
  // matched. First-match-wins requires the more specific, later-firing
  // rules to come first.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: fully converged, convergence explicitly verified before
  // being broadly trusted again, the full convergence window elapsed.
  // Reachable via EITHER immediate/forced invalidation OR a targeted
  // purge (the two alternate strong paths) — this rule's `when` only
  // constrains convergenceVerification + convergenceUncertaintyMode,
  // not which propagation lever was used to get here.
  {
    id: "converged-safe-verified",
    when: {
      triggerEquals: { privilegeRevoked: true, convergenceFullyDone: true },
      controlEquals: {
        [CONVERGENCE_VERIFICATION_KEY]: "verify-before-trust",
        [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-closed",
      },
    },
    incidentState: "converged-safe",
    values: {
      requestSuccessRate: 99.8,
      correctDenyRatePercent: 100,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 100,
      fleetCacheConvergenceStatus: "converged",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "converged-safe",
    },
    componentHealth: healthyHealth,
  },

  // ── Convergence window 2 (partial, verified) — real forward
  // progress, not yet complete. Verification engaged, so the
  // Authorization Layer is correctly NOT broadly re-trusting the cache
  // layer yet (fail-closed continues to hold during this window).
  {
    id: "converging-window2-verified",
    when: {
      triggerEquals: {
        privilegeRevoked: true,
        convergenceWindow2Elapsed: true,
        convergenceFullyDone: false,
      },
      controlEquals: { [CONVERGENCE_VERIFICATION_KEY]: "verify-before-trust" },
    },
    incidentState: "converging-window2",
    values: {
      requestSuccessRate: 99.4,
      correctDenyRatePercent: 95,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 85,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: convergingHealth,
  },

  // ── Convergence window 1 (early partial, verified) — first real
  // convergence progress, lower than window 2's.
  {
    id: "converging-window1-verified",
    when: {
      triggerEquals: {
        privilegeRevoked: true,
        convergenceWindow1Elapsed: true,
        convergenceWindow2Elapsed: false,
      },
      controlEquals: { [CONVERGENCE_VERIFICATION_KEY]: "verify-before-trust" },
    },
    incidentState: "converging-window1",
    values: {
      requestSuccessRate: 99.3,
      correctDenyRatePercent: 90,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 68,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: convergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PASSIVE-TTL-ONLY CONVERGENCE PROGRESSION — invalidation left
  // "lazy", no purge requested, convergence proceeds only on each
  // instance's own TTL expiry. Slower than active propagation, but a
  // real, distinct, non-dead mechanism. Listed before the sequencing
  // trap / safe-degraded / plain-baseline rules below for the same
  // first-match-wins reason as the active-convergence block above.
  // ══════════════════════════════════════════════════════════════════

  // ── Short TTL accelerates PASSIVE convergence even with invalidation
  // left "lazy" and no purge requested: real, distinct, higher
  // convergence than the long-TTL unconverged baseline at an
  // equivalent elapsed time — proving cacheTtlSeconds is not a dead
  // control. Requires fail-closed (this proves the TTL accelerant on
  // the safe path, not combined with the fail-open trap).
  {
    id: "passive-convergence-short-ttl-window1",
    when: {
      triggerEquals: {
        privilegeRevoked: true,
        passiveConvergenceWindow1Elapsed: true,
        passiveConvergenceFullyDone: false,
      },
      controlEquals: {
        [CACHE_INVALIDATION_MODE_KEY]: "lazy",
        [CACHE_TTL_SECONDS_KEY]: 30,
        [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-closed",
      },
    },
    incidentState: "passive-converging-short-ttl",
    values: {
      requestSuccessRate: 99.2,
      correctDenyRatePercent: 92,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 70,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: convergingHealth,
  },

  // ── Long TTL, passive only, fully elapsed: eventually converges on
  // its own TTL cycle with no active push or purge at all — much
  // slower than the active-propagation path, but genuinely reaches
  // near-full convergence (97%, not 100%), proving TTL/invalidation
  // mode alone is a real (if slow) mechanism, not merely cosmetic.
  // Never reaches the OPTIMAL rule above regardless of elapsed time,
  // because convergenceVerification was never engaged — this state
  // stays below full OPTIMAL by construction.
  {
    id: "passive-convergence-fully-done-long-ttl",
    when: {
      triggerEquals: { privilegeRevoked: true, passiveConvergenceFullyDone: true },
      controlEquals: {
        [CACHE_INVALIDATION_MODE_KEY]: "lazy",
        [CACHE_TTL_SECONDS_KEY]: 600,
        [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-closed",
      },
    },
    incidentState: "passive-converged-long-ttl",
    values: {
      requestSuccessRate: 99.7,
      correctDenyRatePercent: 99,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 97,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: convergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING TRAP — assumed-converged without verification. Enough
  // elapsed time has passed to feel safe, but a real minority of the
  // fleet genuinely has not converged. Not itself a security
  // violation while fail-closed holds (staleGrantRatePercent stays 0),
  // but this state is deliberately UNSAFE: cacheConvergencePercent is
  // genuinely below 100 and fleetCacheConvergenceStatus reads
  // "unverified" — no stale grant HAS happened, but nothing has
  // actually confirmed one WON'T, which the acceptable/success
  // conditions below treat as insufficient on its own. Listed before
  // the plain fail-closed baseline fallbacks (which also match
  // `privilegeRevoked` with no further control constraint) since this
  // rule's convergenceWindow2Elapsed trigger is more specific.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "assumed-converged-unverified",
    when: {
      triggerEquals: { privilegeRevoked: true, convergenceWindow2Elapsed: true },
      controlEquals: {
        [CONVERGENCE_VERIFICATION_KEY]: "unverified",
        [CONVERGENCE_UNCERTAINTY_MODE_KEY]: "fail-closed",
      },
    },
    incidentState: "assumed-converged-unverified",
    values: {
      requestSuccessRate: 98.8,
      correctDenyRatePercent: 88,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 85,
      fleetCacheConvergenceStatus: "unverified",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: convergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE SAFE-DEGRADED TRADEOFF — policyStoreReadMode =
  // "source-of-truth-required" forces every decision to double-check
  // the Policy Store directly, which is always correct (zero stale
  // grants, by construction) at a real, deliberate availability cost
  // (lower requestSuccessRate than the fail-closed baseline, since
  // every request now pays a direct Policy Store round-trip). This is
  // the scenario's required legitimate degraded-but-safe state. Listed
  // before the plain fail-closed baseline fallbacks since this rule's
  // policyStoreReadMode constraint is more specific than "no control
  // constraint at all."
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-degraded-source-of-truth-required",
    when: {
      triggerEquals: { privilegeRevoked: true },
      controlEquals: { [POLICY_STORE_READ_MODE_KEY]: "source-of-truth-required" },
    },
    incidentState: "safe-degraded-source-of-truth-required",
    values: {
      requestSuccessRate: 96.5,
      correctDenyRatePercent: 100,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 55,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "safe-degraded",
    },
    componentHealth: safeDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PLAIN FAIL-CLOSED BASELINE — safe but blunt, no meaningful action
  // taken. No security violation, but no convergence progress either.
  // Listed LAST before the healthy-default fallback: these two rules
  // match on `privilegeRevoked` alone (or with `sustainedUnconverged`
  // added) with NO control constraint at all, so every rule above that
  // requires a specific control value or a more specific trigger must
  // come before these two or it would be permanently shadowed.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fail-closed-baseline-sustained",
    when: { triggerEquals: { privilegeRevoked: true, sustainedUnconverged: true } },
    incidentState: "fail-closed-baseline-sustained",
    values: {
      requestSuccessRate: 99.0,
      correctDenyRatePercent: 100,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 40,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: unconvergedHealth,
  },
  {
    id: "fail-closed-baseline",
    when: { triggerEquals: { privilegeRevoked: true } },
    incidentState: "fail-closed-baseline",
    values: {
      requestSuccessRate: 99.2,
      correctDenyRatePercent: 100,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 55,
      fleetCacheConvergenceStatus: "converging",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: unconvergedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99.9,
      correctDenyRatePercent: 100,
      staleGrantRatePercent: 0,
      cacheConvergencePercent: 100,
      fleetCacheConvergenceStatus: "converged",
      cumulativeStalePrivilegeGrantCount: 0,
      enforcementPosture: "fail-closed",
      authorizationStatus: "revoked-not-converged",
    },
    componentHealth: healthyHealth,
  },
];
