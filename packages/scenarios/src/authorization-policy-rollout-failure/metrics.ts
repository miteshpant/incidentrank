import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Gateway/traffic health (the misleading first symptom) ───────────
  // requestSuccessRate drops first and most visibly — read naively, this
  // looks like a generic availability regression (exactly like the four
  // comparison scenarios' symptom shape). The real failure domain is
  // authorization-specific: SELECTIVE false-denies on a subset of
  // resource/identity combinations, not a uniform outage.
  requestSuccessRate: 99.5,

  // Percentage of authorization decisions incorrectly denying access
  // that should have been granted. This is the regression's direct,
  // visible symptom.
  falseDenyRatePercent: 0,

  // Percentage of authorization decisions incorrectly GRANTING access
  // that should have been denied — the scenario's core safety signal.
  // Zero throughout every safe path. Only ever becomes nonzero via
  // fail-open-all or the allow-affected-cohort override, i.e. explicit
  // candidate choices, never as a side effect of the regression itself.
  unauthorizedGrantRatePercent: 0,

  // ── Version skew observability (business invariant 4: "mixed policy
  // versions across the fleet must be observable and bounded") ────────
  // What the Policy Rollout pipeline is currently distributing as
  // source of truth, read directly off the rollout control's current
  // candidate-visible state.
  rolloutPolicyVersion: "v2-bad",
  // Percentage of the PDP fleet's LOCAL policy caches currently
  // enforcing whatever version the rollout/pin control currently names
  // as correct. This is the real recovery-lag mechanism: climbs toward
  // 100 over genuine elapsed simulated time once active invalidation is
  // engaged (faster) or the TTL naturally cycles (slower) — never snaps
  // to 100 on the same tick a control is flipped.
  cacheConvergencePercent: 100,
  // Generic string-state summary of fleet skew, read by
  // success/acceptable conditions and by scoring.
  //   "converged"  — cache convergence is at/near 100% for the CURRENT
  //                  correct version; no material skew.
  //   "skewed"     — a real, bounded, observable minority of the fleet
  //                  is still enforcing a different version than the
  //                  rest while convergence is in progress.
  //   "unbounded"  — rollout is still actively expanding exposure to a
  //                  version while cache convergence for that version is
  //                  low: skew is widening, not bounded or shrinking.
  fleetVersionSkewStatus: "converged",

  // ── Historical / cumulative damage (phase6d3.md this scenario's
  // required historical-damage model — non-self-resetting) ────────────
  // Total number of authorization decisions that have granted
  // unauthorized access to a protected resource over the life of this
  // attempt. Only ever increases. Fixing the current configuration
  // (closing fail-open, removing the override) stops NEW unauthorized
  // grants but never decrements this count — it is a permanent,
  // irreversible historical consequence, exactly like
  // discardedAcknowledgedEntryCount in Ledger Reconciliation Divergence.
  cumulativeUnauthorizedAccessCount: 0,

  // Current enforcement posture, read directly off failOpenMode's
  // candidate-visible state, duplicated here as a string-state field so
  // scoring/success conditions can read it generically (consistent with
  // this codebase's established pattern of mirroring a control's
  // current value into a state field for condition/scoring access).
  enforcementPosture: "fail-closed-all",

  // Generic string-state field summarizing overall authorization
  // correctness, read by success/acceptable conditions and scoring.
  //   "regressed"        — false-denies active, source policy not yet
  //                        fixed.
  //   "fixed-converging" — source policy fixed (pinned/rolled back) but
  //                        cache convergence has not yet completed.
  //   "safe-degraded"    — fail-open-noncritical engaged as a deliberate
  //                        bounded tradeoff while convergence completes;
  //                        protected resources remain fail-closed the
  //                        entire time.
  //   "converged-safe"   — source fixed AND cache convergence complete
  //                        AND no unauthorized access in progress.
  //   "unauthorized-access-active" — fail-open-all or the unsafe
  //                        override is currently granting unauthorized
  //                        access RIGHT NOW. Never safe, regardless of
  //                        any other metric.
  authorizationStatus: "regressed",
};
