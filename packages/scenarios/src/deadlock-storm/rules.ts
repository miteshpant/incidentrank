import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DEADLOCK_RETRY_POLICY_KEY,
  RETRY_BACKOFF_KEY,
  SERVICE_CONCURRENCY_KEY,
  TRANSACTION_LOCK_ORDERING_KEY,
  TRANSACTION_SCOPE_KEY,
  WRITE_SERIALIZATION_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  checkout: "healthy",
  "order-service": "healthy",
  postgresql: "healthy",
  "inventory-service": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  checkout: "degraded",
  "order-service": "degraded",
  postgresql: "degraded",
  "inventory-service": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  checkout: "critical",
  "order-service": "critical",
  postgresql: "critical",
  "inventory-service": "critical",
};

const serializedHealth: Record<string, ComponentHealth> = {
  checkout: "degraded",
  "order-service": "degraded",
  postgresql: "healthy",
  "inventory-service": "degraded",
};

/**
 * Authored rule table for Deadlock Storm, ordered most-specific-first.
 *
 * Core teaching point (the scenario's design requirement): Order Service
 * and Inventory Service acquire locks on the shared orders/inventory
 * tables in inconsistent order after a deployment. Two genuinely distinct
 * families of response exist:
 *
 *   MASKING  — raising deadlockRetryPolicy/serviceConcurrency without
 *              fixing lock order. Transactions that lose a deadlock just
 *              retry (and, with more concurrency, there are more
 *              transactions racing for the same locks in the first
 *              place), so deadlocksPerSec and lockWaitTimeMs climb even
 *              though checkoutFailureRate can look temporarily tolerable
 *              because enough retries eventually succeed. This must
 *              score worse on DB pressure signals even when checkout
 *              failure rate looks acceptable.
 *
 *   REMOVING — switching transactionLockOrdering to "canonical" (both
 *              services now acquire locks in the same order, so the
 *              circular-wait condition that causes a deadlock can no
 *              longer occur) or enabling writeSerialization (removing
 *              concurrency on the contended tables entirely, which also
 *              makes deadlocks structurally impossible, at a severe
 *              throughput cost). Both eliminate deadlocksPerSec at the
 *              root rather than reacting to it after the fact.
 */
export const deadlockStormRules: Rule[] = [
  // ── OPTIMAL recovery: lock order fixed. Deadlocks are structurally
  // impossible regardless of retry policy or concurrency, since the two
  // services never hold conflicting lock orders simultaneously. Checked
  // first/most-specific — this is the real fix and dominates every other
  // control combination once set.
  {
    id: "canonical-ordering-recovery",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: { [TRANSACTION_LOCK_ORDERING_KEY]: "canonical" },
    },
    incidentState: "recovered-canonical",
    values: {
      lockOrderingMode: "fixed",
      writeSerializationActive: "off",
      deadlocksPerSec: 0,
      transactionRetries: 2,
      lockWaitTimeMs: 15,
      checkoutFailureRate: 0.1,
      inventoryUpdateLatencyMs: 45,
      dbConnectionsInUse: 34,
      dbStatus: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE, safe-but-slow recovery: writes to the contended tables
  // are temporarily serialized through a single lane. This also removes
  // deadlocks by construction (no concurrent conflicting lock holders is
  // possible when writes never run concurrently), but checkout throughput
  // suffers badly — reflected in materially higher inventoryUpdateLatencyMs
  // and a visible (if small) checkoutFailureRate from the added queueing,
  // never phrased as a full recovery.
  {
    id: "write-serialization-recovery",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [WRITE_SERIALIZATION_KEY]: true,
      },
    },
    incidentState: "recovered-serialized",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "on",
      deadlocksPerSec: 0,
      transactionRetries: 1,
      lockWaitTimeMs: 180,
      checkoutFailureRate: 2,
      inventoryUpdateLatencyMs: 650,
      dbConnectionsInUse: 20,
      dbStatus: "warning",
    },
    componentHealth: serializedHealth,
  },

  // ── Second-wave escalation: the lock-order conflict is still live AND
  // checkout traffic has surged (timed-events.ts's trafficSurge trigger,
  // 4 minutes after the conflict first appeared). By this point the
  // candidate has already observed deadlocksPerSec and lockWaitTimeMs
  // climbing for the entire lead-up window under any still-unresolved
  // aggressive-retry control combination below — this rule only makes an
  // already-visible, already-worsening trend worse, never a hidden
  // surprise. Scoped to deadlockRetryPolicy "aggressive" specifically
  // (the genuinely unmitigated/masking paths): a candidate who already
  // took the bounded-retry partial-mitigation step sees a smaller, still-
  // observable surge effect instead (bounded-retry-surge-escalation
  // below), never having their partial improvement erased outright.
  // Checked before the non-surge variants so it takes priority whenever
  // both triggers are set and retries are still aggressive.
  {
    id: "traffic-surge-unresolved-conflict-critical",
    when: {
      triggerEquals: { lockOrderConflict: true, trafficSurge: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [WRITE_SERIALIZATION_KEY]: false,
        [DEADLOCK_RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "deadlocking-surge-critical",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 65,
      transactionRetries: 1_400,
      lockWaitTimeMs: 3_200,
      checkoutFailureRate: 24,
      inventoryUpdateLatencyMs: 2_600,
      dbConnectionsInUse: 100,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Second-wave escalation, bounded-retry variant: the candidate
  // already took the partial bounded-retry mitigation, which genuinely
  // reduces (but does not remove) deadlock pressure — the traffic surge
  // still makes things worse than the pre-surge partial state, but not as
  // catastrophically as the still-aggressive-retry path above, honestly
  // reflecting that bounding retries is a real (if incomplete) mitigation.
  {
    id: "bounded-retry-surge-escalation",
    when: {
      triggerEquals: { lockOrderConflict: true, trafficSurge: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [WRITE_SERIALIZATION_KEY]: false,
        [DEADLOCK_RETRY_POLICY_KEY]: "bounded",
      },
    },
    incidentState: "partial-bounded-surge",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 26,
      transactionRetries: 420,
      lockWaitTimeMs: 1_100,
      checkoutFailureRate: 17,
      inventoryUpdateLatencyMs: 820,
      dbConnectionsInUse: 70,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── HARMFUL masking, worst case: legacy lock order untouched, retry
  // policy aggressive, AND concurrency scaled up. Per the design
  // requirement, more concurrent transactions racing for the same
  // conflicting locks plus unbounded immediate retries multiplies lock
  // contention — deadlocksPerSec and lockWaitTimeMs climb well past the
  // unmitigated baseline even though checkoutFailureRate looks deceptively
  // tolerable (retries are eventually getting enough transactions through).
  {
    id: "aggressive-retry-scaled-concurrency-masking-harmful",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [DEADLOCK_RETRY_POLICY_KEY]: "aggressive",
      },
      controlAtLeast: { [SERVICE_CONCURRENCY_KEY]: 16 },
    },
    incidentState: "masked-retry-amplification",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 48,
      transactionRetries: 920,
      lockWaitTimeMs: 2_400,
      checkoutFailureRate: 6,
      inventoryUpdateLatencyMs: 1_900,
      dbConnectionsInUse: 95,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── HARMFUL masking, moderate: aggressive retry alone (default
  // concurrency), legacy ordering untouched. Still amplifies deadlock
  // pressure relative to baseline — more immediate retry attempts against
  // an unresolved conflict means more lock re-acquisition attempts — just
  // not as severely as also scaling concurrency.
  {
    id: "aggressive-retry-masking-harmful",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [DEADLOCK_RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "masked-retry-amplification-moderate",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 32,
      transactionRetries: 540,
      lockWaitTimeMs: 1_600,
      checkoutFailureRate: 5,
      inventoryUpdateLatencyMs: 1_200,
      dbConnectionsInUse: 80,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial mitigation: bounded retry + exponential backoff + narrow
  // transaction scope, legacy ordering untouched. This genuinely reduces
  // deadlock frequency and lock wait time relative to the critical
  // baseline (shorter lock hold windows, fewer synchronized collision
  // waves, no unbounded retry pile-up) but does not remove the underlying
  // conflict — deadlocksPerSec stays well above zero and checkout failures
  // are now visible (bounded retries that exhaust surface as failures
  // instead of being silently retried forever).
  {
    id: "bounded-retry-narrow-scope-partial",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [DEADLOCK_RETRY_POLICY_KEY]: "bounded",
        [RETRY_BACKOFF_KEY]: "exponential",
        [TRANSACTION_SCOPE_KEY]: "narrow",
      },
    },
    incidentState: "partial-mitigated",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 9,
      transactionRetries: 140,
      lockWaitTimeMs: 420,
      checkoutFailureRate: 11,
      inventoryUpdateLatencyMs: 320,
      dbConnectionsInUse: 55,
      dbStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Smaller partial: bounded retry only (fixed backoff, broad scope),
  // legacy ordering untouched. Bounding retries caps the worst-case
  // amplification compared to aggressive, but deadlocks and lock wait
  // time remain elevated and checkout failures are now visible.
  {
    id: "bounded-retry-partial",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: {
        [TRANSACTION_LOCK_ORDERING_KEY]: "legacy",
        [DEADLOCK_RETRY_POLICY_KEY]: "bounded",
      },
    },
    incidentState: "partial-bounded",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 18,
      transactionRetries: 260,
      lockWaitTimeMs: 780,
      checkoutFailureRate: 14,
      inventoryUpdateLatencyMs: 560,
      dbConnectionsInUse: 62,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: legacy lock ordering, retries off, default
  // concurrency/scope/backoff. Deadlocking transactions simply fail
  // outright with no retry — checkout failure rate is high and honest,
  // deadlocksPerSec is elevated but not retry-amplified.
  {
    id: "legacy-ordering-retries-off-critical",
    when: {
      triggerEquals: { lockOrderConflict: true },
      controlEquals: { [DEADLOCK_RETRY_POLICY_KEY]: "off" },
    },
    incidentState: "deadlocking-no-retry",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 14,
      transactionRetries: 0,
      lockWaitTimeMs: 300,
      checkoutFailureRate: 22,
      inventoryUpdateLatencyMs: 260,
      dbConnectionsInUse: 48,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback once the conflict is live: legacy ordering,
  // default control values (aggressive is the scenario's initial default
  // — see controls.ts — so this fallback is only reached if an author/
  // test leaves an unanticipated control combination; kept deliberately
  // severe and critical so no untested combination can accidentally look
  // safe).
  {
    id: "lock-order-conflict-critical-default",
    when: { triggerEquals: { lockOrderConflict: true } },
    incidentState: "deadlocking-critical",
    values: {
      lockOrderingMode: "conflicted",
      writeSerializationActive: "off",
      deadlocksPerSec: 40,
      transactionRetries: 700,
      lockWaitTimeMs: 2_000,
      checkoutFailureRate: 7,
      inventoryUpdateLatencyMs: 1_600,
      dbConnectionsInUse: 90,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no lock-order conflict live yet.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      lockOrderingMode: "fixed",
      writeSerializationActive: "off",
      deadlocksPerSec: 0,
      transactionRetries: 0,
      lockWaitTimeMs: 20,
      checkoutFailureRate: 0,
      inventoryUpdateLatencyMs: 40,
      dbConnectionsInUse: 30,
      dbStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
