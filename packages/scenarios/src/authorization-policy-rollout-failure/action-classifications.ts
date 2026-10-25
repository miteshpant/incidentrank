import type { ActionClassificationRule } from "@incidentrank/simulator";
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

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * (per phase6d3.md section 17) what pressure moved elsewhere, what
 * invariant was protected or violated, and what historical consequence
 * was created. Neutral rule ids only.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: FAIL_OPEN_MODE_KEY,
    valueEquals: "fail-open-all",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "harmful",
    feedback: {
      title: "Switched enforcement to global fail-open",
      explanation:
        "Fail-open-all grants access whenever a policy decision is uncertain, for EVERY resource including protected/critical ones. Request success rate improves sharply — availability genuinely looks fixed — but unauthorizedGrantRatePercent becomes nonzero and cumulativeUnauthorizedAccessCount begins climbing immediately and permanently. This directly violates 'unauthorized access must never be granted to reduce false-denies' and 'critical resources default fail-closed.' The historical count this creates is never erased by switching back, no matter how quickly you do it.",
    },
  },
  {
    id: "acr_2",
    controlKey: FAIL_OPEN_MODE_KEY,
    valueEquals: "fail-open-noncritical",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled bounded fail-open for non-critical resources only",
      explanation:
        "Fail-open-noncritical relieves false-denies for explicitly non-critical resources while protected/critical resources remain fail-closed at every tick — unauthorizedGrantRatePercent stays exactly 0. This is the scenario's legitimate degraded-but-safe tradeoff: real availability relief, zero unauthorized access, as a deliberate bridge while cache convergence completes.",
    },
  },
  {
    id: "acr_3",
    controlKey: FAIL_OPEN_MODE_KEY,
    valueEquals: "fail-closed-all",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Restored fail-closed enforcement for all resources",
      explanation:
        "Returning to fail-closed-all stops any new unauthorized grants immediately — unauthorizedGrantRatePercent returns to 0. It does not erase cumulativeUnauthorizedAccessCount already accrued while fail-open-all was active: that historical count is permanent for this attempt, a real consequence of the earlier choice, not something this correction undoes.",
    },
  },
  {
    id: "acr_4",
    controlKey: POLICY_VERSION_PIN_KEY,
    valueEquals: "v1-pinned-good",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Pinned the rollout to the known-good policy version",
      explanation:
        "Pinning changes what the Policy Store and rollout pipeline will serve on new fetches — new false-denies stop being introduced going forward. It does NOT retroactively change what the PDP fleet's already-cached policy is currently enforcing: cacheConvergencePercent does not move on this action alone. Cache invalidation must still be engaged, and real elapsed convergence time still has to pass, before this is actually safe to hand back.",
    },
  },
  {
    id: "acr_5",
    controlKey: ROLLBACK_SOURCE_POLICY_KEY,
    valueEquals: true,
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Rolled back the source policy to the known-good version",
      explanation:
        "Rolling back the source policy is the alternate strong path to pinning — it fixes what the Policy Store serves going forward, but exactly like pinning, it does nothing by itself to the PDP fleet's already-cached enforcement. Assuming the incident is resolved the moment this is set, without also invalidating caches and waiting for convergence, is the premature-declare trap: some requests keep being evaluated against the stale, regressed policy version until convergence genuinely completes.",
    },
  },
  {
    id: "acr_6",
    controlKey: CACHE_INVALIDATION_KEY,
    valueEquals: "invalidating",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaged active cache invalidation across the fleet",
      explanation:
        "Active invalidation is what actually drives cacheConvergencePercent toward 100 over real elapsed time once the source policy is fixed — without it, convergence only crawls forward on each cache's own TTL cycle. This does not converge the fleet instantly: convergence climbs across real elapsed windows, never on the tick this is set.",
    },
  },
  {
    id: "acr_7",
    controlKey: ROLLOUT_FREEZE_KEY,
    valueEquals: "frozen",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Froze the policy rollout",
      explanation:
        "Freezing stops the regressed version from reaching any additional cohorts — exposure stops widening. This is a necessary first sequencing step, but it does not repair the false-denies already affecting the currently-exposed cohort: request success rate stays degraded until the source policy itself is fixed.",
    },
  },
  {
    id: "acr_8",
    controlKey: ROLLOUT_FREEZE_KEY,
    valueEquals: "rolling",
    whenTriggerEquals: { rolloutRegressionActive: true, sustainedRollout: true },
    outcome: "harmful",
    feedback: {
      title: "Left the rollout actively expanding during a known regression",
      explanation:
        "Leaving rolloutFreeze at 'rolling' while the regression is active and already sustained lets the bad policy version keep reaching additional cohorts. Both falseDenyRatePercent and fleetVersionSkewStatus get materially worse the longer this continues — exposure keeps widening instead of being bounded, directly working against the invariant that mixed policy versions across the fleet must be observable and bounded.",
    },
  },
  {
    id: "acr_9",
    controlKey: EMERGENCY_OVERRIDE_LIST_KEY,
    valueEquals: "allow-affected-cohort",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "harmful",
    feedback: {
      title: "Allow-listed the affected cohort to bypass policy evaluation",
      explanation:
        "This manually grants access to the specific identities/resources currently being false-denied, bypassing real policy evaluation entirely. For any combination where the correct answer should actually have been deny, this is indistinguishable from fail-open — unauthorizedGrantRatePercent becomes nonzero and cumulativeUnauthorizedAccessCount begins climbing, just at a smaller, cohort-bounded scale than global fail-open rather than a different kind of mistake.",
    },
  },
  {
    id: "acr_10",
    controlKey: EMERGENCY_OVERRIDE_LIST_KEY,
    valueEquals: "deny-high-risk",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Added a conservative emergency deny for high-risk access",
      explanation:
        "This conservatively denies an ambiguous/contested resource class rather than granting it — consistent with fail-closed-by-default, and it never creates unauthorized access. It does nothing, however, to repair the underlying false-deny regression for ordinary traffic: request success rate stays degraded until the source policy itself is actually fixed.",
    },
  },
  {
    id: "acr_11",
    controlKey: STAGED_COHORT_KEY,
    valueEquals: "staged-canary",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Restricted rollout exposure to a staged canary cohort",
      explanation:
        "Restricting to a staged canary cohort is the deliberate, cautious step on the forward-fix path: once the known-good version is pinned, re-expanding exposure gradually through a canary rather than immediately back to 'all' limits the blast radius while convergence finishes, directly supporting 'restore rollout gradually' as the final sequencing step.",
    },
  },
  {
    id: "acr_12",
    controlKey: POLICY_CACHE_TTL_SECONDS_KEY,
    valueEquals: 30,
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Shortened policy cache TTL",
      explanation:
        "A shorter TTL makes each PDP instance's local cache refresh sooner on its own, which accelerates convergence onto whichever policy version is currently correct even without an active invalidation sweep — real, measurable, though still slower than active invalidation. Combined with active invalidation it accelerates convergence further still.",
    },
  },
];
