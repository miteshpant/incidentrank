import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ASYNC_WORKER_CONCURRENCY_KEY,
  ASYNC_WORKLOAD_DEFERRAL_KEY,
  CACHE_ASSIST_POLICY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  IDENTITY_CIRCUIT_BREAKER_KEY,
  IDENTITY_FAILURE_MODE_KEY,
  METADATA_WRITE_POLICY_KEY,
  PRODUCT_A_ISOLATION_KEY,
  PRODUCT_B_ISOLATION_KEY,
  PRODUCT_B_PRIORITY_KEY,
  PRODUCT_B_RETRY_POLICY_KEY,
  PRODUCT_C_ISOLATION_KEY,
  RESTORATION_ORDER_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * where pressure moved and any historical consequence created.
 */
export const actionClassifications: ActionClassificationRule[] = [
  // ── Shared Identity's own protection ────────────────────────────────
  {
    id: "acr_identity_breaker_open",
    controlKey: IDENTITY_CIRCUIT_BREAKER_KEY,
    valueEquals: "open",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Opened Shared Identity's circuit breaker",
      explanation:
        "Shedding excess load at Shared Identity itself is what actually lets the root dependency recover — identitySuccessRate climbs from the high-50s/60s back toward 99%+ once this is engaged, instead of staying overwhelmed by whatever amplified volume keeps arriving. On its own (without also capping the Shared Database connection budget) Product A's starvation of the DB pool continues untouched — this protects the root, it does not by itself stop the second, quieter failure domain.",
    },
  },
  {
    id: "acr_identity_fail_open",
    controlKey: IDENTITY_FAILURE_MODE_KEY,
    valueEquals: "fail-open",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Switched Shared Identity to fail-open",
      explanation:
        "Treating an unverifiable token as valid rather than rejecting it directly violates the identity-correctness invariant. Availability-looking metrics do not meaningfully improve (identitySuccessRate is reported as the call completing, not as the verification being genuine), but cumulativeUnverifiedGrantCount begins climbing immediately and never resets — this is a real, permanent correctness violation, not a shortcut, and it can never satisfy a safe resolution regardless of how long it runs.",
    },
  },
  {
    id: "acr_cache_assist",
    controlKey: CACHE_ASSIST_POLICY_KEY,
    valueEquals: "assist",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaged Shared Cache assist policy",
      explanation:
        "Extending how long a recently-valid result may be served while Shared Identity is degraded measurably reduces the validation volume that actually reaches it — cacheAssistHitRatePercent climbs from 35% toward 60%+, and identitySuccessRate improves even with the circuit breaker still closed. This protects the root dependency through a genuinely different mechanism than isolating any product, but alone it is a partial relief, not a full fix — Shared Identity still receives real amplified volume beyond what the cache can absorb.",
    },
  },

  // ── Amplifier-side levers (Product B) ───────────────────────────────
  {
    id: "acr_product_b_isolated",
    controlKey: PRODUCT_B_ISOLATION_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Isolated Product B at the Shared Gateway",
      explanation:
        "Shedding most of Product B's traffic at the edge stops its retry-driven amplification multiplier from continuing to compound onto the shared platform — productBRequestMultiplier returns to 1.0. This is necessary but not sufficient on its own: Shared Identity itself still needs circuit-breaker protection, and Shared Database's connection budget still needs capping, or the platform remains unsafe even with Product B's own dashboard looking much better (the wrong-root trap).",
    },
  },
  {
    id: "acr_product_b_bounded_retry",
    controlKey: PRODUCT_B_RETRY_POLICY_KEY,
    valueEquals: "bounded",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Bounded Product B's retry policy",
      explanation:
        "Capping retry count and backing off between attempts directly reduces the amplification multiplier at its literal mechanism — Product B is never fully cut off, which is this scenario's alternate, softer strong path. Combined with deprioritization at the gateway, this reaches the same fully-recovered end state as full isolation, just via a different amplifier-side lever.",
    },
  },
  {
    id: "acr_product_b_deprioritized",
    controlKey: PRODUCT_B_PRIORITY_KEY,
    valueEquals: "deprioritized",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Deprioritized Product B at admission control",
      explanation:
        "Lowering Product B's admission priority sheds its traffic first under contention without fully cutting it off — a more surgical alternative to isolation. Paired with a bounded retry policy this reaches the same safe end state as full isolation; used alone, without ever protecting Shared Identity or capping the Shared Database budget, this is the wrong-root trap: Product B's own error rate improves while the platform-wide root cause and the DB starvation continue unaddressed.",
    },
  },

  // ── Misdiagnosis traps ───────────────────────────────────────────────
  {
    id: "acr_product_c_isolated_wasted",
    controlKey: PRODUCT_C_ISOLATION_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Isolated Product C",
      explanation:
        "Product C is a mostly-uninvolved bystander exposed only to remaining shared-platform capacity — it never amplifies, never starves, and never caused anything. Isolating it costs its own real revenue (productCErrorRatePercent returns to near-zero only because its traffic was cut, not because anything improved) while doing nothing to relieve Shared Identity, the amplifier, or the DB pool. This is a wasted, incorrect containment action.",
    },
  },
  {
    id: "acr_product_a_isolated_without_db_cap",
    controlKey: PRODUCT_A_ISOLATION_KEY,
    valueEquals: "isolated",
    whenTriggerEquals: { identityDegraded: true, starvationCompounded: true },
    outcome: "neutral",
    feedback: {
      title: "Isolated Product A directly",
      explanation:
        "Isolating Product A does stop its own traffic from holding connections, but the structural fix for 'a single product must not exhaust shared-platform capacity for every product' is capping the Shared Database connection budget itself — that protects every product, including ones that misbehave in the future, not just this one. Isolating Product A works for this incident but does not address the underlying capacity-sharing gap the DB connection budget control exists for.",
    },
  },

  // ── Shared Database / messaging levers ──────────────────────────────
  {
    id: "acr_db_budget_capped",
    controlKey: DB_CONNECTION_BUDGET_KEY,
    valueEquals: "capped",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped the Shared Database connection budget",
      explanation:
        "Enforcing a hard per-product connection ceiling directly stops any single product from exhausting shared capacity for everyone, satisfying the platform's core capacity invariant regardless of which product's behavior caused the pressure. dbWriteSuccessRatePercent recovers from the 40-60% range back toward 99%+ once this is engaged and connections drain. Capping the budget AFTER connection-exhaustion rejections have already happened stops NEW damage but never erases cumulativeConnectionExhaustionCount's already-incurred total — that historical count is carried forward unchanged.",
    },
  },
  {
    id: "acr_worker_scaling_before_db_cap",
    controlKey: ASYNC_WORKER_CONCURRENCY_KEY,
    valueEquals: "scaled",
    whenTriggerEquals: { identityDegraded: true, starvationCompounded: true, dbDrainWindow1Elapsed: false },
    outcome: "harmful",
    feedback: {
      title: "Scaled Async Workers before capping the Shared Database budget",
      explanation:
        "Raising consumer concurrency does increase how fast Shared Messaging's backlog could drain, but every additional worker also holds its own Shared Database connection. Without the connection budget capped first, this pushes MORE concurrent connections at an already-exhausted pool — dbWriteSuccessRatePercent drops to roughly 41% and cumulativeConnectionExhaustionCount climbs by hundreds more, both measurably worse than leaving concurrency at normal. Pressure that looked like pure messaging throughput was transferred directly into Shared Database connection risk.",
    },
  },
  {
    id: "acr_worker_scaling_after_db_cap",
    controlKey: ASYNC_WORKER_CONCURRENCY_KEY,
    valueEquals: "scaled",
    whenTriggerEquals: { dbDrainWindow1Elapsed: true },
    outcome: "beneficial",
    feedback: {
      title: "Scaled Async Workers after the Shared Database budget was capped",
      explanation:
        "With the connection budget already capped, raising consumer concurrency now safely accelerates how fast Shared Messaging's real backlog drains, without re-exposing the Shared Database pool to new exhaustion pressure. This is the correct order for this lever — the same control applied before capping the budget is harmful (see the pressure-transfer trap), applied after is a genuine accelerant.",
    },
  },
  {
    id: "acr_workload_deferral",
    controlKey: ASYNC_WORKLOAD_DEFERRAL_KEY,
    valueEquals: "deferred",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Deferred new async workload",
      explanation:
        "Holding new low-priority work back at Shared Messaging lets Async Workers spend their currently-scarce concurrency draining the existing backlog first rather than racing new work against it. No work is discarded — this only reorders dispatch — but messagingBacklogCount grows measurably slower than it otherwise would while the platform is still under containment.",
    },
  },
  {
    id: "acr_metadata_read_only",
    controlKey: METADATA_WRITE_POLICY_KEY,
    valueEquals: "read-only",
    whenTriggerEquals: { identityDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched Shared Metadata writes to read-only",
      explanation:
        "Stopping new metadata writes while identity correctness cannot be reliably verified protects durability at a real, bounded availability cost — metadataWriteSafety returns to 'safe' immediately. Writes are queued, not discarded, so no durable data is lost; reads continue to be served. This is the correct response to an identity-correctness risk, distinct from and independent of whichever product-level containment is also engaged.",
    },
  },

  // ── Restoration ordering ────────────────────────────────────────────
  {
    id: "acr_restoration_root_first",
    controlKey: RESTORATION_ORDER_KEY,
    valueEquals: "root-first",
    whenTriggerEquals: { msgFullyDrainedElapsed: true, dbFullyDrainedElapsed: true, identityRecoveryWindowElapsed: true },
    outcome: "beneficial",
    feedback: {
      title: "Restored products in deliberate root-first order",
      explanation:
        "Restoring the uninvolved bystander first, then the product that was starving the DB pool once its pressure has genuinely drained, then the amplifier last only once both recovery-lag subsystems have fully drained and Shared Identity's own recovery is confirmed, reaches the same final unlocked state as any other restoration approach but without ever re-triggering the cascade. This is only reachable once the real, elapsed drain windows for both independent subsystems have actually passed — not merely once containment was first engaged.",
    },
  },
  {
    id: "acr_restoration_all_at_once_premature",
    controlKey: RESTORATION_ORDER_KEY,
    valueEquals: "all-at-once",
    whenTriggerEquals: { sustainedCascade: true, msgFullyDrainedElapsed: false },
    outcome: "harmful",
    feedback: {
      title: "Restored all products at once before drain windows elapsed",
      explanation:
        "Removing isolation from every product simultaneously before Shared Messaging's backlog has fully drained and before Shared Identity's own recovery window has elapsed re-exposes the platform to the exact same amplification and starvation pressure that caused the incident — identitySuccessRate collapses back to the low-60s, dbWriteSuccessRatePercent drops to roughly 54%, and cumulativeConnectionExhaustionCount resumes climbing. This is a real, measurably worse outcome than the exact same final restoration reached deliberately after both subsystems' drain windows have genuinely elapsed.",
    },
  },
];
