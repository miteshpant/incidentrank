import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── convergenceUncertaintyMode ───────────────────────────────────
  {
    id: "acc_1",
    controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY,
    valueEquals: "fail-open",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "harmful",
    feedback: {
      title: "Fail-open granted access on an unverified, already-revoked privilege",
      explanation:
        "Setting convergence-uncertainty handling to fail-open made availability and latency metrics look better — no request was ever denied while cache convergence was in doubt. That apparent improvement is not real: it directly violates the invariant that a request must never be granted on a privilege that has already been revoked at the source, even if a stale cache instance believes it is still valid. Every tick this stayed active added to a permanent, non-resetting count of stale privilege grants, which stays on the record even after you revert to fail-closed, and materially penalizes Data Integrity and Reliability regardless of how healthy availability looked.",
    },
  },
  {
    id: "acc_2",
    controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY,
    valueEquals: "fail-closed",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Fail-closed denied access whenever convergence could not be verified",
      explanation:
        "Keeping convergence-uncertainty handling at fail-closed protects against the central security risk this incident poses: a request is denied, not granted, whenever the cache layer's convergence state cannot be verified. This is a real, if blunt, availability cost — some requests that would have been correctly denied anyway are now also denying for the unconverged minority that might have been fine — but it never risks honoring an already-revoked privilege.",
    },
  },

  // ── cachePurgeScope ──────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: CACHE_PURGE_SCOPE_KEY,
    valueEquals: "broad-trust-all",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "harmful",
    feedback: {
      title: "Broad trust-all flush re-admitted stale cache state instead of converging it",
      explanation:
        "A blanket flush-and-refill of the entire cache fleet looks like an instant availability fix, but each instance simply refills from whatever it currently holds — including instances that never converged on the revocation. Paired with fail-closed, this measurably regresses fleet convergence compared to doing nothing at all. Paired with fail-open, it actively compounds the live stale-grant violation. Use a targeted purge of only the affected privilege/resource pair instead.",
    },
  },
  {
    id: "acc_4",
    controlKey: CACHE_PURGE_SCOPE_KEY,
    valueEquals: "targeted",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Targeted purge converged exactly the affected privilege, nothing more",
      explanation:
        "Purging only the specific cache entries tied to the revoked privilege/resource pair converges precisely the state that needs to converge, without disturbing unrelated cached grants elsewhere in the fleet — a precise, bounded, genuinely safe remediation and one of this scenario's two legitimate paths to full recovery.",
    },
  },

  // ── cacheInvalidationMode ────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: CACHE_INVALIDATION_MODE_KEY,
    valueEquals: "immediate",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Immediate push invalidation began real fleet-wide convergence",
      explanation:
        "Switching the Policy Store to actively push a targeted invalidation the moment a revocation occurs lets cache instances that receive the push stop serving the stale grant right away, rather than waiting out a passive TTL. Convergence still takes real elapsed propagation time — this does not instantly fix anything on the same tick — but it is the correct accelerant for this incident.",
    },
  },
  {
    id: "acc_6",
    controlKey: CACHE_INVALIDATION_MODE_KEY,
    valueEquals: "forced",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Forced fleet re-sync reached instances a targeted push could miss",
      explanation:
        "Triggering one fleet-wide forced re-sync converges even instances that were partitioned from a targeted push or were otherwise unreachable — a legitimate, slightly more expensive complement to immediate push invalidation, still subject to the same real elapsed convergence time as every other propagation lever.",
    },
  },
  {
    id: "acc_7",
    controlKey: CACHE_INVALIDATION_MODE_KEY,
    valueEquals: "lazy",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "neutral",
    feedback: {
      title: "Lazy invalidation leaves convergence to each instance's own TTL",
      explanation:
        "Leaving invalidation at lazy means no active push ever reaches the fleet — convergence still eventually happens as each cache instance's TTL naturally expires, but far more slowly than an active propagation lever. Not unsafe by itself (fail-closed still protects correctness while this is the case), but it leaves real, avoidable availability cost on the table for longer than necessary.",
    },
  },

  // ── cacheTtlSeconds ──────────────────────────────────────────────
  {
    id: "acc_8",
    controlKey: CACHE_TTL_SECONDS_KEY,
    valueEquals: 30,
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Shortening cache TTL accelerated passive convergence",
      explanation:
        "Lowering the per-instance TTL to 30 seconds means every cache instance naturally re-checks the Policy Store far sooner on its own, meaningfully shortening the convergence tail for any instance an active push never reached — a real, non-dead accelerant, genuinely faster than the 600-second default at an equivalent elapsed time.",
    },
  },
  {
    id: "acc_9",
    controlKey: CACHE_TTL_SECONDS_KEY,
    valueEquals: 600,
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving cache TTL at its generous default leaves a long passive tail",
      explanation:
        "Keeping TTL at 600 seconds is fine for ordinary read performance, but it leaves a long passive-convergence tail for any cache instance an active invalidation push never reached — shortening it, or engaging an active push/purge, converges the fleet materially faster.",
    },
  },

  // ── convergenceVerification ──────────────────────────────────────
  {
    id: "acc_10",
    controlKey: CONVERGENCE_VERIFICATION_KEY,
    valueEquals: "unverified",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving convergence unverified risks trusting a fleet that has not actually converged",
      explanation:
        "Without an explicit convergence check against the Policy Store, elapsed time alone is not proof that every cache instance has converged — a real, nonzero minority of the fleet can remain unconverged well after it starts to feel safe to assume otherwise. This is the scenario's required sequencing discipline: verify before broadly trusting the cache layer again, never assume time alone proves convergence.",
    },
  },
  {
    id: "acc_11",
    controlKey: CONVERGENCE_VERIFICATION_KEY,
    valueEquals: "verify-before-trust",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Verify-before-trust confirmed convergence instead of assuming it",
      explanation:
        "Running a real convergence check against the Policy Store before the Authorization Layer resumes broadly trusting Cache Distribution directly implements the required sequencing discipline for this incident: convergence must be verified, not merely assumed because a purge was requested or because time has elapsed. This is a required ingredient of the OPTIMAL recovery path.",
    },
  },

  // ── policyStoreReadMode ──────────────────────────────────────────
  {
    id: "acc_12",
    controlKey: POLICY_STORE_READ_MODE_KEY,
    valueEquals: "source-of-truth-required",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "beneficial",
    feedback: {
      title: "Source-of-truth-required traded latency for guaranteed correctness",
      explanation:
        "Forcing every authorization decision to double-check the Policy Store directly is always correct — the Policy Store is the revocation's actual source of truth, so no stale cache state can ever produce a stale grant while this is engaged. It adds real latency to every request for as long as it stays on; this is a genuine, deliberate availability cost, not a free win, and is this scenario's required legitimate safe-degraded tradeoff.",
    },
  },
  {
    id: "acc_13",
    controlKey: POLICY_STORE_READ_MODE_KEY,
    valueEquals: "cached-ok",
    whenTriggerEquals: { privilegeRevoked: true },
    outcome: "neutral",
    feedback: {
      title: "Cached-ok is fast but only as correct as each cache instance's own convergence",
      explanation:
        "Accepting a cache instance's answer without a direct Policy Store round-trip is fast, but during an active revocation it is only as correct as that specific instance's own convergence state — not unsafe by itself as long as fail-closed is enforced, but it does not independently guarantee correctness the way source-of-truth-required does.",
    },
  },
];
