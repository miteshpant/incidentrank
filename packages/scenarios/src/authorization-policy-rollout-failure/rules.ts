import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHE_INVALIDATION_KEY,
  EMERGENCY_OVERRIDE_LIST_KEY,
  FAIL_OPEN_MODE_KEY,
  POLICY_CACHE_TTL_SECONDS_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLBACK_SOURCE_POLICY_KEY,
  ROLLOUT_FREEZE_KEY,
  STAGED_COHORT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  requests: "healthy",
  "api-gateway": "healthy",
  "policy-decision-point": "healthy",
  "policy-store": "healthy",
  "identity-context": "healthy",
  "resource-metadata": "healthy",
  "policy-rollout": "healthy",
};

const regressedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "policy-decision-point": "degraded",
  "policy-rollout": "critical",
};

const unauthorizedAccessHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "policy-decision-point": "critical",
  "identity-context": "critical",
  "policy-rollout": "critical",
};

const convergingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "policy-decision-point": "degraded",
  "policy-rollout": "degraded",
};

const safeDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "policy-decision-point": "degraded",
  "resource-metadata": "degraded",
};

/**
 * Authored rule table for Authorization Policy Rollout Failure, ordered
 * most-specific-first (unsafe correctness traps first — they win
 * regardless of every other control, because unauthorized access is
 * never acceptable no matter how healthy availability metrics look —
 * then safe progression/degraded states, then baseline/escalation).
 *
 * ROOT CAUSE: the Policy Rollout / Cache Distribution pipeline pushed a
 * regressed policy version ("v2-bad") that introduces selective
 * false-denies on a subset of resource/identity combinations. This is
 * NOT a generic availability regression (contrast partial-rollout-
 * regression / deployment-regression / bad-configuration-rollout) — it
 * is specifically an AUTHORIZATION correctness problem with an
 * asymmetric risk surface: a false-deny only costs availability, while
 * the tempting "fix" (fail-open) creates unauthorized access, which is
 * irreversible and must never be traded for availability (business
 * invariant #1/#5).
 *
 * PREMATURE-DECLARE TRAP (unsafe sequencing example #2 from the spec):
 * fixing the SOURCE (pin to v1-pinned-good, or rollbackSourcePolicy)
 * changes what the Policy Store / rollout pipeline will serve on a
 * fresh fetch — it does NOT retroactively change what the PDP fleet's
 * own already-cached policy is currently enforcing. cacheConvergencePercent
 * only ever climbs over real elapsed simulated time (see timed-events.ts),
 * never on the same tick the source is fixed. A candidate who fixes the
 * source and immediately assumes the incident is over is still serving
 * stale, regressed decisions from unconverged caches — this must never
 * satisfy successCondition/acceptableCondition regardless of how
 * "fixed" the source looks.
 *
 * PRESSURE-TRANSFER MECHANISM (fail-open -> security correctness loss,
 * phase6d3.md binding): failOpenMode = "fail-open-all" while the
 * regression is active makes requestSuccessRate near-perfect (every
 * false-deny is replaced by a grant) — availability genuinely improves
 * — but unauthorizedGrantRatePercent becomes nonzero and
 * cumulativeUnauthorizedAccessCount increases every tick it stays
 * active, with real, distinct, non-reset authored values. This can
 * NEVER satisfy either completion condition, however long it runs.
 *
 * HISTORICAL DAMAGE MODEL: cumulativeUnauthorizedAccessCount only ever
 * increases while unauthorized access is actively being granted
 * (fail-open-all, or the allow-affected-cohort emergency override).
 * Switching back to fail-closed-all stops NEW unauthorized grants
 * (unauthorizedGrantRatePercent returns to 0) but the cumulative count
 * is carried forward unchanged in every subsequent rule state — it is
 * never reset to zero by any control or any amount of elapsed time.
 *
 * ALTERNATE STRONG PATHS (both independently reach OPTIMAL):
 *   1. Safe rollback: rollbackSourcePolicy=true + active invalidation +
 *      full convergence window elapsed.
 *   2. Safe forward-fix: policyVersionPin=v1-pinned-good (without ever
 *      flipping rollbackSourcePolicy) + stagedCohort re-expansion +
 *      active invalidation + full convergence window elapsed.
 * Both are authored to reach the identical converged-safe end state —
 * genuinely, independently viable, not a decoy vs a real answer.
 */
export const authorizationPolicyRolloutFailureRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — unauthorized access actively happening.
  // Checked first; win regardless of every other control.
  // ══════════════════════════════════════════════════════════════════

  // ── Global fail-open, sustained rollout: the worst reachable state.
  // Listed before the non-sustained variant (sustainedRollout implies
  // rolloutRegressionActive, so the more specific rule must come first
  // or it would be permanently shadowed — same first-match-wins
  // ordering concern as the Phase 6D.2 scenarios).
  {
    id: "fail-open-all-sustained-unauthorized-access",
    when: {
      triggerEquals: { rolloutRegressionActive: true, sustainedRollout: true },
      controlEquals: { [FAIL_OPEN_MODE_KEY]: "fail-open-all" },
    },
    incidentState: "fail-open-all-sustained",
    values: {
      requestSuccessRate: 99.8,
      falseDenyRatePercent: 0,
      unauthorizedGrantRatePercent: 14,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 40,
      fleetVersionSkewStatus: "unbounded",
      cumulativeUnauthorizedAccessCount: 820,
      enforcementPosture: "fail-open-all",
      authorizationStatus: "unauthorized-access-active",
    },
    componentHealth: unauthorizedAccessHealth,
  },
  {
    id: "fail-open-all-unauthorized-access",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: { [FAIL_OPEN_MODE_KEY]: "fail-open-all" },
    },
    incidentState: "fail-open-all",
    values: {
      requestSuccessRate: 99.7,
      falseDenyRatePercent: 0,
      unauthorizedGrantRatePercent: 11,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 60,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 240,
      enforcementPosture: "fail-open-all",
      authorizationStatus: "unauthorized-access-active",
    },
    componentHealth: unauthorizedAccessHealth,
  },

  // ── Emergency allow-list trap: bypasses the PDP entirely for the
  // affected cohort. Smaller blast radius than global fail-open (a
  // bounded cohort, not the whole fleet) but the SAME kind of
  // violation for any combination that should genuinely have been
  // denied — real, nonzero, counted.
  {
    id: "emergency-allow-override-sustained",
    when: {
      triggerEquals: { rolloutRegressionActive: true, sustainedRollout: true },
      controlEquals: { [EMERGENCY_OVERRIDE_LIST_KEY]: "allow-affected-cohort" },
    },
    incidentState: "emergency-allow-override-sustained",
    values: {
      requestSuccessRate: 99.5,
      falseDenyRatePercent: 1,
      unauthorizedGrantRatePercent: 5,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 40,
      fleetVersionSkewStatus: "unbounded",
      cumulativeUnauthorizedAccessCount: 310,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "unauthorized-access-active",
    },
    componentHealth: unauthorizedAccessHealth,
  },
  {
    id: "emergency-allow-override",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: { [EMERGENCY_OVERRIDE_LIST_KEY]: "allow-affected-cohort" },
    },
    incidentState: "emergency-allow-override",
    values: {
      requestSuccessRate: 99.3,
      falseDenyRatePercent: 1,
      unauthorizedGrantRatePercent: 4,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 60,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 95,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "unauthorized-access-active",
    },
    componentHealth: unauthorizedAccessHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PREMATURE-DECLARE TRAP — source fixed, caches NOT converged.
  // Looks "fixed" on the rollout/version surface, but a real,
  // observable, bounded-but-not-yet-resolved skew remains.
  // ══════════════════════════════════════════════════════════════════

  // Source fixed (either pin or rollback), invalidation never engaged,
  // TTL left at its long default, no convergence window elapsed: cache
  // convergence sits exactly where it was the instant the source was
  // fixed — proof fixing the source does not retroactively fix caches.
  // Requires policyCacheTtlSeconds=300 explicitly so a candidate who
  // has ALSO shortened the TTL is correctly routed to the (slower, but
  // real) passive-TTL convergence rules below instead of being stuck
  // in this trap forever — short TTL is a genuine accelerant, not a
  // no-op, and must not be shadowed by this less-specific rule.
  {
    id: "source-fixed-no-invalidation-unconverged",
    when: {
      triggerEquals: { rolloutRegressionActive: true, passiveConvergenceFullyDone: false },
      controlEquals: {
        [POLICY_VERSION_PIN_KEY]: "v1-pinned-good",
        [CACHE_INVALIDATION_KEY]: "idle",
        [POLICY_CACHE_TTL_SECONDS_KEY]: 300,
      },
    },
    incidentState: "source-fixed-unconverged",
    values: {
      requestSuccessRate: 96.5,
      falseDenyRatePercent: 3.2,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 25,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },
  {
    id: "source-rolled-back-no-invalidation-unconverged",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [ROLLBACK_SOURCE_POLICY_KEY]: true,
        [CACHE_INVALIDATION_KEY]: "idle",
        [POLICY_CACHE_TTL_SECONDS_KEY]: 300,
      },
    },
    incidentState: "source-rolled-back-unconverged",
    values: {
      requestSuccessRate: 96.5,
      falseDenyRatePercent: 3.2,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 25,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE DEGRADED STATE — fail-open-noncritical as a deliberate, bounded
  // tradeoff while convergence completes. Protected/critical resources
  // remain fail-closed at every tick; unauthorizedGrantRatePercent stays
  // exactly 0 regardless of how long this runs.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-degraded-noncritical-fail-open",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [FAIL_OPEN_MODE_KEY]: "fail-open-noncritical",
        [CACHE_INVALIDATION_KEY]: "invalidating",
      },
    },
    incidentState: "safe-degraded-noncritical",
    values: {
      requestSuccessRate: 98.6,
      falseDenyRatePercent: 0.8,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 55,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-open-noncritical",
      authorizationStatus: "safe-degraded",
    },
    componentHealth: safeDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE PROGRESSION TOWARD OPTIMAL — source fixed AND active
  // invalidation engaged. Convergence climbs across real elapsed
  // windows (recovery lag), never instantly. Reachable via EITHER
  // rollback OR pin (the two alternate strong paths) — authored
  // identically once the source is fixed, since "fixed" is fixed
  // regardless of which lever the candidate used.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: fully converged, source fixed, invalidation engaged,
  // the full convergence window elapsed. Reachable from pin OR
  // rollback — this is where both alternate strong paths land.
  //
  // HISTORICAL DAMAGE NOTE: this rule's `values.cumulativeUnauthorized
  // AccessCount` authors 0 — the engine fully replaces `values` on
  // every tick with whichever rule currently matches (see tick.ts),
  // so there is no running accumulator a later "clean" rule could
  // read to know "did this attempt ever pass through fail-open-all."
  // The permanent, non-self-resetting historical record is instead
  // state.peaks.peakValues.cumulativeUnauthorizedAccessCount (a
  // numericWatchField with trackPeak:true — see definition.ts), which
  // the engine computes generically as
  // Math.max(previousPeak, currentValue) every tick regardless of
  // which rule is currently matched, and which extractScoringInputs/
  // extractFinishScoringInputs already expose as
  // ScoringInputs.peakNumericValues — read by this scenario's test
  // suite and available to scoring exactly like every other scenario's
  // peak-tracked historical count. This is the same mechanism Ledger
  // Reconciliation Divergence and Distributed Coordination Failure
  // rely on for their own peak/historical bookkeeping, generalized
  // rather than reinvented here with a second, parallel mechanism.
  {
    id: "converged-safe-pinned",
    when: {
      triggerEquals: { rolloutRegressionActive: true, convergenceFullyDone: true },
      controlEquals: {
        [POLICY_VERSION_PIN_KEY]: "v1-pinned-good",
        [CACHE_INVALIDATION_KEY]: "invalidating",
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "converged-safe",
    values: {
      requestSuccessRate: 99.6,
      falseDenyRatePercent: 0.1,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 100,
      fleetVersionSkewStatus: "converged",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "converged-safe",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "converged-safe-rolled-back",
    when: {
      triggerEquals: { rolloutRegressionActive: true, convergenceFullyDone: true },
      controlEquals: {
        [ROLLBACK_SOURCE_POLICY_KEY]: true,
        [CACHE_INVALIDATION_KEY]: "invalidating",
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "converged-safe",
    values: {
      requestSuccessRate: 99.6,
      falseDenyRatePercent: 0.1,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 100,
      fleetVersionSkewStatus: "converged",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "converged-safe",
    },
    componentHealth: healthyHealth,
  },

  // ── Staged cohort re-expansion in progress (forward-fix sequencing
  // step 5): source already fixed, invalidation engaged, cohort
  // restricted to staged-canary rather than "all" — a real, distinct,
  // deliberately cautious intermediate state on the forward-fix path,
  // before the candidate widens exposure back to "all". Checked BEFORE
  // the plain converging-window1 rule below — same trigger/control
  // shape plus the additional stagedCohort constraint — so a candidate
  // deliberately staging re-expansion is never shadowed by the less-
  // specific plain convergence rule.
  {
    id: "staged-cohort-reexpansion-in-progress",
    when: {
      triggerEquals: { rolloutRegressionActive: true, convergenceWindow1Elapsed: true },
      controlEquals: {
        [POLICY_VERSION_PIN_KEY]: "v1-pinned-good",
        [CACHE_INVALIDATION_KEY]: "invalidating",
        [STAGED_COHORT_KEY]: "staged-canary",
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "staged-reexpansion",
    values: {
      requestSuccessRate: 98.4,
      falseDenyRatePercent: 1.0,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 62,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },

  // ── Convergence window 2 (partial): source fixed, invalidation
  // engaged, a second (but not final) window elapsed — real forward
  // progress, not yet complete. Proves recovery lag: more elapsed time
  // => higher convergence, at a point strictly between the unconverged
  // trap and full convergence.
  {
    id: "converging-window2",
    when: {
      triggerEquals: {
        rolloutRegressionActive: true,
        convergenceWindow2Elapsed: true,
        convergenceFullyDone: false,
      },
      controlEquals: {
        [CACHE_INVALIDATION_KEY]: "invalidating",
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "converging-window2",
    values: {
      requestSuccessRate: 98.8,
      falseDenyRatePercent: 0.9,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 85,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },

  // ── Convergence window 1 (early partial): first real convergence
  // progress, lower than window 2's.
  {
    id: "converging-window1",
    when: {
      triggerEquals: {
        rolloutRegressionActive: true,
        convergenceWindow1Elapsed: true,
        convergenceWindow2Elapsed: false,
      },
      controlEquals: {
        [CACHE_INVALIDATION_KEY]: "invalidating",
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "converging-window1",
    values: {
      requestSuccessRate: 97.9,
      falseDenyRatePercent: 1.8,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 62,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },

  // ── Short TTL accelerates PASSIVE convergence even with no active
  // invalidation sweep: source fixed, invalidation idle, short TTL
  // (30s instead of 300s), first passive window elapsed. Materially
  // higher convergence than the long-TTL unconverged trap at an
  // equivalent elapsed time, proving policyCacheTtlSeconds is a real,
  // distinct accelerant rather than a dead control. Requires the pin
  // (not rollbackSourcePolicy) — this scenario demonstrates the TTL
  // accelerant specifically on the forward-fix path; the rollback path
  // is proven safe via active invalidation instead (see
  // SAFE_ROLLBACK_ACTIONS in the test suite).
  {
    id: "passive-convergence-short-ttl-window1",
    when: {
      triggerEquals: {
        rolloutRegressionActive: true,
        passiveConvergenceWindow1Elapsed: true,
        passiveConvergenceFullyDone: false,
      },
      controlEquals: {
        [POLICY_VERSION_PIN_KEY]: "v1-pinned-good",
        [CACHE_INVALIDATION_KEY]: "idle",
        [POLICY_CACHE_TTL_SECONDS_KEY]: 30,
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "passive-converging-short-ttl",
    values: {
      requestSuccessRate: 98.1,
      falseDenyRatePercent: 1.6,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 58,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },

  // ── Long TTL, passive only, fully elapsed: eventually converges on
  // its own TTL cycle with no active invalidation at all — much slower
  // than the active-invalidation path (requires PASSIVE_CONVERGENCE_
  // FULLY_DONE_MS, far later than CONVERGENCE_FULLY_DONE_MS), but
  // genuinely reaches full convergence, proving TTL alone is a real
  // (if slow) mechanism, not merely cosmetic.
  {
    id: "passive-convergence-fully-done-long-ttl",
    when: {
      triggerEquals: { rolloutRegressionActive: true, passiveConvergenceFullyDone: true },
      controlEquals: {
        [POLICY_VERSION_PIN_KEY]: "v1-pinned-good",
        [CACHE_INVALIDATION_KEY]: "idle",
        [POLICY_CACHE_TTL_SECONDS_KEY]: 300,
        [FAIL_OPEN_MODE_KEY]: "fail-closed-all",
      },
    },
    incidentState: "passive-converged-long-ttl",
    values: {
      requestSuccessRate: 99.5,
      falseDenyRatePercent: 0.2,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v1-pinned-good",
      cacheConvergencePercent: 97,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "fixed-converging",
    },
    componentHealth: convergingHealth,
  },

  // ── Neutral/legitimate but incomplete: emergency deny-high-risk
  // override engaged while regression is active. Conservatively denies
  // an ambiguous/contested resource class rather than granting it —
  // consistent with fail-closed-by-default, genuinely safe (never
  // grants unauthorized access), but does nothing to repair the
  // underlying false-deny regression for ordinary traffic.
  {
    id: "emergency-deny-high-risk-neutral",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: { [EMERGENCY_OVERRIDE_LIST_KEY]: "deny-high-risk" },
    },
    incidentState: "emergency-deny-high-risk",
    values: {
      requestSuccessRate: 92.5,
      falseDenyRatePercent: 7.0,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 70,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "regressed",
    },
    componentHealth: regressedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING — rollout never frozen: exposure keeps widening while
  // the candidate fiddles with other controls. Strictly worse than the
  // frozen baseline at the same elapsed time. Checked only once none of
  // the real-progress rules above have matched (e.g. the candidate
  // changed TTL or fail-open-noncritical without ever freezing AND
  // without reaching a rule that ignores rolloutFreeze — in this
  // scenario every genuine progress rule above is reachable
  // independent of rolloutFreeze, so this rule's real job is to catch
  // "nothing else has been done yet, and exposure is still widening").
  // ══════════════════════════════════════════════════════════════════
  {
    id: "rollout-not-frozen-widening-sustained",
    when: {
      triggerEquals: { rolloutRegressionActive: true, sustainedRollout: true },
      controlEquals: { [ROLLOUT_FREEZE_KEY]: "rolling" },
    },
    incidentState: "widening-unfrozen",
    values: {
      requestSuccessRate: 91.0,
      falseDenyRatePercent: 9.5,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 15,
      fleetVersionSkewStatus: "unbounded",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "regressed",
    },
    componentHealth: regressedHealth,
  },

  // ── Frozen, source not yet fixed: exposure stops widening (necessary
  // step 1) but false-denies for the already-exposed cohort continue —
  // freezing alone is not a fix.
  {
    id: "rollout-frozen-source-not-fixed",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: { [ROLLOUT_FREEZE_KEY]: "frozen" },
    },
    incidentState: "frozen-source-unfixed",
    values: {
      requestSuccessRate: 94.0,
      falseDenyRatePercent: 5.8,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 70,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "regressed",
    },
    componentHealth: regressedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — regression active, no meaningful action taken yet.
  //
  // NOTE: there is deliberately no separate "baseline-sustained" rule
  // here. Once sustainedRollout fires, rolloutFreeze's only two
  // allowed values are already fully claimed by more specific rules
  // above (rollout-not-frozen-widening-sustained for "rolling",
  // rollout-frozen-source-not-fixed for "frozen") — a true
  // zero-action baseline necessarily still has rolloutFreeze at its
  // initial "rolling" value, so it is correctly and exclusively
  // caught by rollout-not-frozen-widening-sustained once sustained,
  // not by a separate dead rule here.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-regression",
    when: { triggerEquals: { rolloutRegressionActive: true } },
    incidentState: "baseline",
    values: {
      requestSuccessRate: 95.5,
      falseDenyRatePercent: 4.5,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 70,
      fleetVersionSkewStatus: "skewed",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "regressed",
    },
    componentHealth: regressedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99.5,
      falseDenyRatePercent: 0,
      unauthorizedGrantRatePercent: 0,
      rolloutPolicyVersion: "v2-bad",
      cacheConvergencePercent: 100,
      fleetVersionSkewStatus: "converged",
      cumulativeUnauthorizedAccessCount: 0,
      enforcementPosture: "fail-closed-all",
      authorizationStatus: "regressed",
    },
    componentHealth: healthyHealth,
  },
];
