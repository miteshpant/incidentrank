import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Gateway/traffic health (the misleading first symptom) ───────────
  // requestSuccessRate stays high throughout almost every reachable
  // state in this scenario, including the worst security violations —
  // this incident does NOT present as an availability outage. A
  // candidate who only watches success rate will see nothing wrong.
  requestSuccessRate: 99.9,

  // Percentage of authorization decisions that correctly deny the
  // already-revoked privilege. 100 means every cache instance is
  // converged and denying correctly.
  correctDenyRatePercent: 100,

  // The scenario's core safety signal: percentage of authorization
  // decisions that GRANT access on a privilege that has already been
  // revoked at the Policy Store. Zero on every safe path. Only ever
  // becomes nonzero when a stale cache instance is actually consulted
  // and trusted for the revoked privilege/resource pair — never a side
  // effect of the revocation itself.
  staleGrantRatePercent: 0,

  // ── Convergence observability ────────────────────────────────────────
  // Percentage of the Cache Distribution fleet that has actually
  // converged on the Policy Store's current (post-revocation) answer
  // for the affected privilege/resource pair. This is the real
  // recovery-lag mechanism: climbs toward 100 over genuine elapsed
  // simulated time once a real invalidation/purge lever is engaged, or
  // more slowly via passive TTL expiry — never snaps to 100 on the same
  // tick a control is flipped.
  cacheConvergencePercent: 100,

  // Generic string-state summary of fleet convergence, read by
  // success/acceptable conditions and by scoring.
  //   "converged"   — convergence is at/near 100% for the revoked
  //                   privilege; no cache instance still grants it.
  //   "converging"  — a real, bounded, shrinking minority of the fleet
  //                   has not yet converged; some may still grant.
  //   "unverified"  — the candidate has not verified convergence before
  //                   broadly trusting the cache layer again; whether
  //                   any instance still grants is genuinely unknown.
  fleetCacheConvergenceStatus: "converged",

  // ── Historical / cumulative damage (REQUIRED, non-self-resetting) ───
  // Total number of authorization decisions that have GRANTED access on
  // the already-revoked privilege, over the life of this attempt, via a
  // stale cache instance actually being consulted and trusted. Only
  // ever increases while a stale grant is actively being served.
  // Reverting to fail-closed / achieving convergence stops NEW stale
  // grants but never decrements this count — it is a permanent,
  // irreversible historical consequence.
  cumulativeStalePrivilegeGrantCount: 0,

  // Current authorization-layer enforcement posture, read directly off
  // convergenceUncertaintyMode's candidate-visible state, duplicated
  // here as a string-state field so scoring/success conditions can read
  // it generically.
  enforcementPosture: "fail-closed",

  // Generic string-state field summarizing overall authorization
  // correctness for the revoked privilege, read by success/acceptable
  // conditions and scoring.
  //   "revoked-not-converged"       — revocation has happened at the
  //                                   source; fleet has not converged;
  //                                   no stale grant is currently active
  //                                   (fail-closed is holding the line).
  //   "safe-degraded"               — source-of-truth-required engaged
  //                                   as a deliberate, bounded
  //                                   availability tradeoff while
  //                                   convergence completes; zero stale
  //                                   grants the entire time.
  //   "converged-safe"              — fleet convergence complete AND no
  //                                   stale grant in progress.
  //   "stale-grant-active"          — a stale cache instance is
  //                                   currently being trusted and is
  //                                   actively granting the revoked
  //                                   privilege RIGHT NOW. Never safe,
  //                                   regardless of any other metric.
  authorizationStatus: "revoked-not-converged",
};
