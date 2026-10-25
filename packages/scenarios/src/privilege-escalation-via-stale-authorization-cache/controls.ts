import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How the Cache Distribution fleet learns that a privilege has been
 * revoked at the Policy Store (the source of truth). "lazy" (default/
 * root-cause state) means each cache instance only re-checks the Policy
 * Store when its own TTL expires — a subset of instances keep serving
 * the now-revoked grant until their individual TTL happens to lapse.
 * "immediate" switches the Policy Store to actively push a targeted
 * invalidation to the fleet the moment a revocation occurs — this is
 * the real convergence accelerant: instances that receive the push stop
 * serving the stale grant immediately, rather than waiting out a TTL.
 * "forced" additionally triggers one fleet-wide forced re-sync right
 * now, converging every remaining never-pushed instance as well
 * (covers instances that were partitioned from the push, or were never
 * reachable by targeted purge). Neither "immediate" nor "forced" is a
 * security control by itself — convergence still takes real elapsed
 * propagation time (see timed-events.ts); they only change how fast it
 * happens, never whether an unverified cache may be trusted meanwhile.
 */
export const CACHE_INVALIDATION_MODE_KEY = "cacheInvalidationMode";

/**
 * The central policy lever governing what the Authorization Layer does
 * when it cannot verify that a given cache instance's state has
 * actually converged with the Policy Store. "fail-closed" (default/
 * safe) denies the request when convergence cannot be verified —
 * directly implementing the scenario's security invariant: a request
 * must never be granted on a privilege that has already been revoked at
 * the source, even if the stale cache instance believes it is still
 * valid. "fail-open" is the scenario's central forbidden lever: it
 * grants access whenever ANY cache instance says yes, with no
 * convergence verification at all — this is exactly the mechanism that
 * lets a revoked privilege keep being honored by stale cache state, and
 * it creates a real, permanent, non-resetting historical
 * unauthorized-access consequence for every tick it stays active while
 * a stale grant is actually being served (see
 * metrics.ts's cumulativeStalePrivilegeGrantCount).
 */
export const CONVERGENCE_UNCERTAINTY_MODE_KEY = "convergenceUncertaintyMode";

/**
 * Per-cache-instance time-to-live before a passive (non-pushed) refresh
 * against the Policy Store. 600s (default) is generous and safe for
 * read performance but leaves a long passive-convergence tail for any
 * instance the invalidation push never reached. 120s meaningfully
 * shortens that tail. 30s shortens it further still. This genuinely
 * interacts with cacheInvalidationMode: a long TTL with "lazy"
 * invalidation leaves convergence to crawl at the TTL's own pace; a
 * short TTL accelerates passive convergence on its own, and combined
 * with "immediate"/"forced" invalidation it closes the tail fastest.
 * Lowering TTL alone never grants anything it shouldn't — it is a pure
 * accelerant, never a security control.
 */
export const CACHE_TTL_SECONDS_KEY = "cacheTtlSeconds";

/**
 * Whether the Authorization Layer explicitly verifies fleet-wide
 * convergence before broadly trusting the Cache Distribution layer
 * again. "unverified" (default) means the candidate has not confirmed
 * convergence — merely assuming "enough time has probably passed" is
 * not verification. "verify-before-trust" runs a real convergence check
 * against the Policy Store before the Authorization Layer resumes
 * treating cache responses as authoritative fleet-wide — this is the
 * scenario's required sequencing discipline: convergence must be
 * VERIFIED before the cache layer is broadly trusted again, not merely
 * assumed because a purge was requested or because time has elapsed.
 * Skipping this and simply waiting is the "assumed converged" trap:
 * genuinely unconverged instances can still exist even after a purge
 * was requested, if that purge has not itself finished propagating.
 */
export const CONVERGENCE_VERIFICATION_KEY = "convergenceVerification";

/**
 * The scope of any cache purge/flush action taken against the fleet.
 * "none" (default) — no purge requested. "targeted" purges only the
 * specific cache entries tied to the revoked privilege/resource pair —
 * a precise, bounded, genuinely safe remediation that converges exactly
 * the state that needs to converge, without disturbing unrelated
 * cached grants. "broad-trust-all" is the scenario's second forbidden
 * lever: a blanket "trust whatever any cache instance currently holds"
 * flush-and-refill, marketed as an instant availability fix — it either
 * re-admits the exact stale grants it was supposed to clear (every
 * instance refills from whatever it last held, including instances that
 * never converged) or, paired with fail-open convergence handling,
 * actively grants access on unverifiable cache state. It looks like it
 * instantly fixes latency/availability complaints; it does not fix
 * correctness, and when combined with fail-open it actively worsens it.
 */
export const CACHE_PURGE_SCOPE_KEY = "cachePurgeScope";

/**
 * Whether the Authorization Layer's own request path additionally
 * double-checks the Policy Store directly on every decision, rather
 * than trusting whatever Cache Distribution already returned.
 * "cached-ok" (default) lets the Authorization Layer accept a cache
 * instance's answer without a direct Policy Store round-trip — fast,
 * but only as correct as that specific cache instance's own convergence
 * state. "source-of-truth-required" forces a direct Policy Store check
 * on every decision — this is always correct (the Policy Store is the
 * revocation's actual source of truth) but adds real latency to every
 * request for as long as it stays on, a genuine (if minor) availability
 * cost rather than a free win — not the scenario's primary remediation,
 * but a legitimate temporary safety net while convergence is still in
 * doubt.
 */
export const POLICY_STORE_READ_MODE_KEY = "policyStoreReadMode";

export const controls: ControlDefinition[] = [
  {
    key: CACHE_INVALIDATION_MODE_KEY,
    allowedValues: ["lazy", "immediate", "forced"],
    initialValue: "lazy",
  },
  {
    key: CONVERGENCE_UNCERTAINTY_MODE_KEY,
    allowedValues: ["fail-closed", "fail-open"],
    initialValue: "fail-closed",
  },
  {
    key: CACHE_TTL_SECONDS_KEY,
    allowedValues: [600, 120, 30],
    initialValue: 600,
  },
  {
    key: CONVERGENCE_VERIFICATION_KEY,
    allowedValues: ["unverified", "verify-before-trust"],
    initialValue: "unverified",
  },
  {
    key: CACHE_PURGE_SCOPE_KEY,
    allowedValues: ["none", "targeted", "broad-trust-all"],
    initialValue: "none",
  },
  {
    key: POLICY_STORE_READ_MODE_KEY,
    allowedValues: ["cached-ok", "source-of-truth-required"],
    initialValue: "cached-ok",
  },
];
