import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Rollout freeze for the Policy Rollout / Cache Distribution pipeline.
 * "rolling" (default, root-cause state) means the bad policy version
 * keeps being pushed to additional cohorts over time. "frozen" stops any
 * FURTHER cohorts from receiving a new policy version — it does not by
 * itself fix anything already served, and it does not force already-
 * stale caches to converge; it only stops the skew from getting wider.
 * This is sequencing step 1 ("freeze rollout") — necessary but never
 * sufficient on its own.
 */
export const ROLLOUT_FREEZE_KEY = "rolloutFreeze";

/**
 * Which policy version the Policy Rollout pipeline is currently
 * distributing as the source of truth. "v2-bad" is the regressed
 * version (root cause — selective false-denies on a subset of
 * resource/identity combinations). "v1-pinned-good" pins the rollout
 * back to the last known-good version — sequencing step 2 ("pin known-
 * good policy"). Pinning changes what NEW cache fetches/refreshes will
 * receive; it does NOT retroactively change what already-cached PDP
 * instances are currently enforcing (see cacheConvergencePercent) —
 * this is the premature-declare trap the scenario is built around.
 */
export const POLICY_VERSION_PIN_KEY = "policyVersionPin";

/**
 * Whether the candidate has explicitly rolled back the *source* policy
 * configuration (distinct from policyVersionPin: this models directly
 * reverting the authored policy document itself, the literal "rollback"
 * lever named in the spec). Rolling back the source alone changes what
 * the Policy Store will serve on next fetch; exactly like pinning, it
 * does nothing to already-cached PDP state by itself — the unsafe
 * "rollback source policy -> assume caches are already converged" trap
 * is built on this control being set TRUE while cacheConvergencePercent
 * is still well below 100.
 */
export const ROLLBACK_SOURCE_POLICY_KEY = "rollbackSourcePolicy";

/**
 * Forces an active cache-invalidation/refresh sweep across the PDP
 * fleet's policy caches. "idle" (default) means caches only refresh
 * passively on their own TTL schedule. "invalidating" actively pushes
 * invalidation across the fleet — this is sequencing step 3 ("invalidate
 * /refresh caches") and the scenario's required recovery-lag mechanism:
 * cacheConvergencePercent climbs toward 100 over real elapsed simulated
 * time while this is set, it never jumps there on the same tick the
 * control is flipped.
 */
export const CACHE_INVALIDATION_KEY = "cacheInvalidation";

/**
 * Fail-open/fail-closed enforcement mode, authored per the spec as a
 * single fleet-wide lever with three distinct postures (rather than one
 * boolean) so the "by resource class" business invariant is real and
 * testable: "fail-closed-all" (default/safe — every resource, including
 * non-critical ones, denies on policy-evaluation uncertainty, e.g.
 * during version skew). "fail-open-noncritical" degrades availability
 * protection ONLY for explicitly non-critical resources while keeping
 * protected/critical resources fail-closed — this is the scenario's one
 * legitimate bounded-tradeoff degraded mode. "fail-open-all" is the
 * forbidden global lever: it grants access on policy-evaluation
 * uncertainty for EVERY resource, including protected/critical ones —
 * the scenario's required pressure-transfer mechanism (availability
 * gained, unauthorized access created) and an unsafe path that can never
 * resolve safely.
 */
export const FAIL_OPEN_MODE_KEY = "failOpenMode";

/**
 * Policy cache TTL in seconds at each PDP instance. Lower values mean
 * caches naturally refresh (and pick up a corrected/pinned policy
 * version) sooner even without an active invalidation sweep; higher
 * values mean stale/bad-version caches persist longer on their own.
 * Genuinely interacts with cacheInvalidation: a long TTL with no active
 * invalidation leaves convergence to crawl at the TTL's own pace; a
 * short TTL accelerates passive convergence, and combined with active
 * invalidation accelerates it further still.
 */
export const POLICY_CACHE_TTL_SECONDS_KEY = "policyCacheTtlSeconds";

/**
 * Which cohort of the fleet is currently eligible to receive the policy
 * rollout. "all" (default) means every cohort is in scope for whatever
 * version the rollout pipeline is currently distributing. "staged-canary"
 * restricts live rollout exposure to a small canary cohort only — this
 * is sequencing step 5 ("restore rollout gradually"): once the known-good
 * version is pinned and convergence is verified, a candidate forward-
 * fixing (rather than rolling back) re-expands exposure through this
 * cohort control rather than jumping straight back to "all."
 */
export const STAGED_COHORT_KEY = "stagedCohort";

/**
 * Emergency manual override list applied directly at the API Gateway,
 * bypassing the Policy Decision Point entirely for whatever identities/
 * resources it names. "none" (default) — no override. "deny-high-risk"
 * adds an explicit emergency deny for the specific resource class most
 * exposed by the false-deny regression's INVERSE failure (i.e. a
 * conservative emergency deny for ambiguous/contested access), which is
 * safe but does not fix normal traffic. "allow-affected-cohort" is the
 * scenario's second forbidden shortcut: it manually allow-lists the
 * specific identity/resource combinations currently being false-denied,
 * which "fixes" the symptom for affected users by granting access
 * without going through real policy evaluation at all — for any
 * combination where the real answer should have been deny, this is
 * indistinguishable from the global fail-open trap and is classified
 * exactly as harmfully.
 */
export const EMERGENCY_OVERRIDE_LIST_KEY = "emergencyOverrideList";

export const controls: ControlDefinition[] = [
  {
    key: ROLLOUT_FREEZE_KEY,
    allowedValues: ["rolling", "frozen"],
    initialValue: "rolling",
  },
  {
    key: POLICY_VERSION_PIN_KEY,
    allowedValues: ["v2-bad", "v1-pinned-good"],
    initialValue: "v2-bad",
  },
  {
    key: ROLLBACK_SOURCE_POLICY_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CACHE_INVALIDATION_KEY,
    allowedValues: ["idle", "invalidating"],
    initialValue: "idle",
  },
  {
    key: FAIL_OPEN_MODE_KEY,
    allowedValues: ["fail-closed-all", "fail-open-noncritical", "fail-open-all"],
    initialValue: "fail-closed-all",
  },
  {
    key: POLICY_CACHE_TTL_SECONDS_KEY,
    allowedValues: [30, 300],
    initialValue: 300,
  },
  {
    key: STAGED_COHORT_KEY,
    allowedValues: ["all", "staged-canary"],
    initialValue: "all",
  },
  {
    key: EMERGENCY_OVERRIDE_LIST_KEY,
    allowedValues: ["none", "deny-high-risk", "allow-affected-cohort"],
    initialValue: "none",
  },
];
