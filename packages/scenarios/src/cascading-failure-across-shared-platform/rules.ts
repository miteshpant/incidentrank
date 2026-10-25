import type { ComponentHealth, Rule } from "@incidentrank/simulator";
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

const healthyHealth: Record<string, ComponentHealth> = {
  "product-a": "healthy",
  "product-b": "healthy",
  "product-c": "healthy",
  "shared-gateway": "healthy",
  "shared-cache": "healthy",
  "shared-identity": "healthy",
  "shared-metadata": "healthy",
  "shared-messaging": "healthy",
  "async-workers": "healthy",
  "shared-database": "healthy",
};

// Root degrading, nothing contained: Identity slow, Metadata exposed,
// everything downstream starting to feel it.
const rootDegradingHealth: Record<string, ComponentHealth> = {
  "product-a": "healthy",
  "product-b": "degraded",
  "product-c": "healthy",
  "shared-gateway": "degraded",
  "shared-cache": "degraded",
  "shared-identity": "critical",
  "shared-metadata": "degraded",
  "shared-messaging": "degraded",
  "async-workers": "healthy",
  "shared-database": "healthy",
};

// Full cascade: amplification AND starvation both compounded, nothing
// contained — the worst reachable "did nothing" state.
const fullCascadeHealth: Record<string, ComponentHealth> = {
  "product-a": "degraded",
  "product-b": "critical",
  "product-c": "degraded",
  "shared-gateway": "critical",
  "shared-cache": "degraded",
  "shared-identity": "critical",
  "shared-metadata": "critical",
  "shared-messaging": "critical",
  "async-workers": "degraded",
  "shared-database": "critical",
};

// Wrong-root trap: Product B isolated/bounded (the loud signal silenced)
// but Identity itself never protected and the DB budget never capped.
// Product B's own dashboard looks much better; the platform is not
// actually safe.
const wrongRootTrapHealth: Record<string, ComponentHealth> = {
  "product-a": "degraded",
  "product-b": "degraded",
  "product-c": "degraded",
  "shared-gateway": "degraded",
  "shared-cache": "degraded",
  "shared-identity": "critical",
  "shared-metadata": "critical",
  "shared-messaging": "degraded",
  "async-workers": "healthy",
  "shared-database": "critical",
};

// Identity fail-open: a correctness violation, irrespective of how
// healthy availability looks.
const identityViolationHealth: Record<string, ComponentHealth> = {
  "product-a": "healthy",
  "product-b": "healthy",
  "product-c": "healthy",
  "shared-gateway": "healthy",
  "shared-cache": "degraded",
  "shared-identity": "critical",
  "shared-metadata": "critical",
  "shared-messaging": "degraded",
  "async-workers": "healthy",
  "shared-database": "degraded",
};

// Contained: root protected + amplifier contained + DB budget capped,
// backlogs not yet drained.
const containedHealth: Record<string, ComponentHealth> = {
  "product-a": "degraded",
  "product-b": "degraded",
  "product-c": "healthy",
  "shared-gateway": "degraded",
  "shared-cache": "healthy",
  "shared-identity": "degraded",
  "shared-metadata": "degraded",
  "shared-messaging": "degraded",
  "async-workers": "degraded",
  "shared-database": "degraded",
};

// Draining: containment holding, backlogs genuinely shrinking.
const drainingHealth: Record<string, ComponentHealth> = {
  "product-a": "degraded",
  "product-b": "degraded",
  "product-c": "healthy",
  "shared-gateway": "healthy",
  "shared-cache": "healthy",
  "shared-identity": "healthy",
  "shared-metadata": "healthy",
  "shared-messaging": "degraded",
  "async-workers": "healthy",
  "shared-database": "degraded",
};

// Recovered-but-isolated: everything safe, products still deliberately
// isolated/degraded pending restoration order.
const recoveredIsolatedHealth: Record<string, ComponentHealth> = {
  "product-a": "degraded",
  "product-b": "degraded",
  "product-c": "healthy",
  "shared-gateway": "healthy",
  "shared-cache": "healthy",
  "shared-identity": "healthy",
  "shared-metadata": "healthy",
  "shared-messaging": "healthy",
  "async-workers": "healthy",
  "shared-database": "healthy",
};

// Unsafe pressure-transfer: Async Workers scaled before the DB
// connection budget is capped — more concurrent connections pushed at
// an already-exhausted pool.
const workerScalingPressureTransferHealth: Record<string, ComponentHealth> = {
  "product-a": "critical",
  "product-b": "degraded",
  "product-c": "degraded",
  "shared-gateway": "degraded",
  "shared-cache": "degraded",
  "shared-identity": "degraded",
  "shared-metadata": "critical",
  "shared-messaging": "degraded",
  "async-workers": "degraded",
  "shared-database": "critical",
};

// Re-cascaded: premature all-at-once restoration retriggered the
// cascade after containment had genuinely started working.
const reCascadedHealth: Record<string, ComponentHealth> = {
  "product-a": "critical",
  "product-b": "critical",
  "product-c": "degraded",
  "shared-gateway": "critical",
  "shared-cache": "degraded",
  "shared-identity": "critical",
  "shared-metadata": "critical",
  "shared-messaging": "critical",
  "async-workers": "degraded",
  "shared-database": "critical",
};

/**
 * Authored rule table for Cascading Failure Across Shared Platform,
 * ordered most-specific-first (unsafe correctness traps first — they
 * win regardless of every other control — then the wrong-root/loudest-
 * product trap, then the unsafe-early-restoration trap, then real
 * containment/drain/restoration progression, then alternate strong
 * paths, then the pressure-transfer trap, then sequencing/baseline
 * defaults).
 *
 * ROOT CAUSE: Shared Identity's token-validation latency degrades first
 * (identityDegraded). Everything else is a downstream external
 * consequence of that one degradation:
 *   - Product B's aggressive retry policy amplifies it (LOUD signal,
 *     NOT the root — amplificationCompounded).
 *   - Product A's connections, held open longer waiting on slow
 *     identity validation, slowly exhaust the Shared Database
 *     connection pool (QUIET signal, starvationCompounded).
 *   - Product C is a mostly-uninvolved bystander exposed only to
 *     remaining shared-platform capacity.
 *
 * WRONG-ROOT / LOUDEST-PRODUCT TRAP (required, tested explicitly):
 * isolating/deprioritizing/bounding ONLY Product B — the loudest,
 * reddest dashboard — without ever protecting Shared Identity itself
 * (circuit breaker / cache assist) and without capping the Shared
 * Database connection budget leaves identitySuccessRate critically low
 * and dbWriteSuccessRatePercent actively collapsing from Product A's
 * unchecked starvation. Product B's OWN error rate looks much better;
 * the platform as a whole is not safe. This can never satisfy
 * successCondition/acceptableCondition.
 *
 * PRESSURE-TRANSFER MECHANISM (phase6d.4.md section 14, binding):
 * scaling Async Worker concurrency BEFORE capping the Shared Database
 * connection budget pushes MORE concurrent connections at an already-
 * exhausted pool — dbWriteSuccessRatePercent and
 * cumulativeConnectionExhaustionCount both get measurably WORSE than
 * leaving concurrency at "normal", with real, distinct, authored
 * values (see "worker-scaling-pressure-transfer" below).
 *
 * HISTORICAL DAMAGE MODEL: cumulativeConnectionExhaustionCount and
 * cumulativeUnverifiedGrantCount only ever increase while their
 * respective unsafe condition is actively true. Fixing the condition
 * afterward (capping the DB budget; switching back to fail-closed)
 * stops NEW damage but never erases what already happened — every
 * subsequent rule state in this table carries the exact value forward
 * unchanged rather than resetting it, and both fields are additionally
 * peak-tracked (numericWatchFields, trackPeak:true) as the permanent,
 * non-resettable historical record scoring reads regardless of how
 * clean current health looks.
 *
 * UNSAFE-EARLY-RESTORATION TRAP (required, tested explicitly):
 * restorationOrder="all-at-once" while containment has only JUST
 * started working (drain windows not yet elapsed, identity not yet
 * confirmed recovered) retriggers the full cascade — a real, measurably
 * worse outcome (re-cascaded) than the exact same final isolation state
 * reached deliberately via "root-first" after both recovery-lag
 * subsystems have actually drained.
 *
 * STRONG SEQUENCING (required, tested explicitly): the SAME eventual
 * set of controls (amplifier contained, root protected, DB budget
 * capped, workers scaled, restoration ordered) applied in a DIFFERENT
 * order produces a measurably worse outcome — either via the pressure-
 * transfer trap (scale workers before capping DB budget) or the
 * restoration trap (restore before drain windows elapse).
 *
 * ALTERNATE STRONG PATHS (both independently reach OPTIMAL, equally
 * safe end states):
 *   1. Full isolation: productBIsolation="isolated" + identity
 *      protected + DB budget capped + workers scaled (after capping) +
 *      deferral engaged + root-first restoration after full drain.
 *   2. Bounded-retry + deprioritization: productBRetryPolicy="bounded"
 *      + productBPriority="deprioritized" (never fully isolating
 *      Product B) + identity protected + DB budget capped + workers
 *      scaled (after capping) + root-first restoration after full
 *      drain — a materially different, softer amplifier-side lever
 *      reaching the identical fully-recovered end state.
 */
export const cascadingFailureAcrossSharedPlatformRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAP — identity fail-open. Wins regardless of
  // every other control; checked first.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "identity-fail-open-violation",
    when: {
      triggerEquals: { identityDegraded: true },
      controlEquals: { [IDENTITY_FAILURE_MODE_KEY]: "fail-open" },
    },
    incidentState: "identity-fail-open-violation",
    values: {
      identityValidationLatencyMs: 900,
      identityStatus: "critical",
      identitySuccessRate: 99.9,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 1.0,
      productBRequestMultiplier: 3.5,
      productAErrorRatePercent: 0.5,
      productAHeldConnectionCount: 140,
      productCErrorRatePercent: 0.5,
      gatewayAdmittedRequestRatePercent: 98,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 2_400,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 70,
      dbStatus: "warning",
      dbWriteSuccessRatePercent: 96,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 640,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "identity-correctness-violated",
    },
    componentHealth: identityViolationHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNSAFE EARLY RESTORATION TRAP — all-at-once restoration before both
  // drain windows have elapsed AND identity recovery is confirmed.
  // Checked before the real containment/drain progression so it always
  // wins over a merely-started containment attempt.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "premature-all-at-once-restoration",
    when: {
      triggerEquals: {
        identityDegraded: true,
        sustainedCascade: true,
        msgFullyDrainedElapsed: false,
      },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
        [RESTORATION_ORDER_KEY]: "all-at-once",
      },
    },
    incidentState: "re-cascaded",
    values: {
      identityValidationLatencyMs: 820,
      identityStatus: "critical",
      identitySuccessRate: 61,
      cacheAssistHitRatePercent: 40,
      productBErrorRatePercent: 22,
      productBRequestMultiplier: 3.1,
      productAErrorRatePercent: 9,
      productAHeldConnectionCount: 150,
      productCErrorRatePercent: 7,
      gatewayAdmittedRequestRatePercent: 70,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 2_900,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 97,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 54,
      cumulativeConnectionExhaustionCount: 310,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "re-cascading",
    },
    componentHealth: reCascadedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // WRONG-ROOT / LOUDEST-PRODUCT TRAP — Product B contained (isolated
  // or bounded+deprioritized), but Shared Identity never protected and
  // the DB budget never capped. Product B's own dashboard improves;
  // the platform is not actually safe.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "wrong-root-loudest-product-isolated",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [PRODUCT_B_ISOLATION_KEY]: "isolated",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "wrong-root-trap",
    values: {
      identityValidationLatencyMs: 780,
      identityStatus: "critical",
      identitySuccessRate: 58,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 1.5,
      productBRequestMultiplier: 1.0,
      productAErrorRatePercent: 4,
      productAHeldConnectionCount: 160,
      productCErrorRatePercent: 6,
      gatewayAdmittedRequestRatePercent: 88,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_100,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 94,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 61,
      cumulativeConnectionExhaustionCount: 180,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "isolated",
      productCRestorationStatus: "normal",
      platformStatus: "starving",
    },
    componentHealth: wrongRootTrapHealth,
  },
  {
    id: "wrong-root-loudest-product-deprioritized",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [PRODUCT_B_PRIORITY_KEY]: "deprioritized",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "wrong-root-trap",
    values: {
      identityValidationLatencyMs: 790,
      identityStatus: "critical",
      identitySuccessRate: 57,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 3,
      productBRequestMultiplier: 1.4,
      productAErrorRatePercent: 4,
      productAHeldConnectionCount: 160,
      productCErrorRatePercent: 6,
      gatewayAdmittedRequestRatePercent: 89,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_250,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 93,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 63,
      cumulativeConnectionExhaustionCount: 170,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "degraded",
      productCRestorationStatus: "normal",
      platformStatus: "starving",
    },
    componentHealth: wrongRootTrapHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PRESSURE-TRANSFER TRAP — Async Workers scaled before the DB
  // connection budget is capped. Checked before the safe-progression
  // rules so scaling-first-wrong-order is always caught.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "worker-scaling-pressure-transfer",
    when: {
      triggerEquals: { identityDegraded: true, starvationCompounded: true },
      controlEquals: {
        [ASYNC_WORKER_CONCURRENCY_KEY]: "scaled",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "worker-scaling-pressure-transfer",
    values: {
      identityValidationLatencyMs: 640,
      identityStatus: "critical",
      identitySuccessRate: 64,
      cacheAssistHitRatePercent: 38,
      productBErrorRatePercent: 14,
      productBRequestMultiplier: 2.6,
      productAErrorRatePercent: 11,
      productAHeldConnectionCount: 210,
      productCErrorRatePercent: 9,
      gatewayAdmittedRequestRatePercent: 80,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 900,
      messagingStatus: "warning",
      dbConnectionPoolUtilizationPercent: 100,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 29,
      cumulativeConnectionExhaustionCount: 650,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "starving",
    },
    componentHealth: workerScalingPressureTransferHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE PROGRESSION — root protected (circuit breaker open) + amplifier
  // genuinely contained (isolated OR bounded+deprioritized) + DB budget
  // capped. This is the real containment combination; everything below
  // this point is real forward progress, gated by elapsed drain time.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL (path 1: full isolation): fully drained on BOTH
  // independent subsystems, identity recovery confirmed, deliberately
  // restored root-first.
  {
    id: "optimal-full-isolation-restored",
    when: {
      triggerEquals: {
        identityDegraded: true,
        msgFullyDrainedElapsed: true,
        dbFullyDrainedElapsed: true,
        identityRecoveryWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_B_ISOLATION_KEY]: "isolated",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
        [RESTORATION_ORDER_KEY]: "root-first",
      },
    },
    incidentState: "optimal-recovered",
    values: {
      identityValidationLatencyMs: 42,
      identityStatus: "normal",
      identitySuccessRate: 99.6,
      cacheAssistHitRatePercent: 60,
      productBErrorRatePercent: 0.4,
      productBRequestMultiplier: 1.0,
      productAErrorRatePercent: 0.3,
      productAHeldConnectionCount: 20,
      productCErrorRatePercent: 0.2,
      gatewayAdmittedRequestRatePercent: 100,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 0,
      messagingStatus: "normal",
      dbConnectionPoolUtilizationPercent: 46,
      dbStatus: "normal",
      dbWriteSuccessRatePercent: 100,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "recovered",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL (path 2: bounded-retry + deprioritization — Product B
  // never fully isolated): same recovered end state reached via the
  // softer amplifier-side lever.
  {
    id: "optimal-bounded-retry-restored",
    when: {
      triggerEquals: {
        identityDegraded: true,
        msgFullyDrainedElapsed: true,
        dbFullyDrainedElapsed: true,
        identityRecoveryWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_B_RETRY_POLICY_KEY]: "bounded",
        [PRODUCT_B_PRIORITY_KEY]: "deprioritized",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
        [RESTORATION_ORDER_KEY]: "root-first",
      },
    },
    incidentState: "optimal-recovered",
    values: {
      identityValidationLatencyMs: 44,
      identityStatus: "normal",
      identitySuccessRate: 99.5,
      cacheAssistHitRatePercent: 58,
      productBErrorRatePercent: 0.5,
      productBRequestMultiplier: 1.0,
      productAErrorRatePercent: 0.3,
      productAHeldConnectionCount: 20,
      productCErrorRatePercent: 0.2,
      gatewayAdmittedRequestRatePercent: 100,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 0,
      messagingStatus: "normal",
      dbConnectionPoolUtilizationPercent: 47,
      dbStatus: "normal",
      dbWriteSuccessRatePercent: 100,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "recovered",
    },
    componentHealth: healthyHealth,
  },

  // ── Fully drained but NOT yet deliberately restored (restorationOrder
  // still "none"): genuinely safe (ACCEPTABLE tier candidate — see
  // definition.ts's completion-mode audit), platform is safe but
  // products remain isolated/degraded, a legitimate degraded-but-safe
  // handback state.
  {
    id: "acceptable-drained-not-restored",
    when: {
      triggerEquals: {
        identityDegraded: true,
        msgFullyDrainedElapsed: true,
        dbFullyDrainedElapsed: true,
        identityRecoveryWindowElapsed: true,
      },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
        [RESTORATION_ORDER_KEY]: "none",
      },
    },
    incidentState: "acceptable-drained-isolated",
    values: {
      identityValidationLatencyMs: 45,
      identityStatus: "normal",
      identitySuccessRate: 99.4,
      cacheAssistHitRatePercent: 55,
      productBErrorRatePercent: 0.6,
      productBRequestMultiplier: 1.0,
      productAErrorRatePercent: 0.4,
      productAHeldConnectionCount: 25,
      productCErrorRatePercent: 0.2,
      gatewayAdmittedRequestRatePercent: 92,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 0,
      messagingStatus: "normal",
      dbConnectionPoolUtilizationPercent: 48,
      dbStatus: "normal",
      dbWriteSuccessRatePercent: 100,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "degraded",
      productBRestorationStatus: "isolated",
      productCRestorationStatus: "normal",
      platformStatus: "contained",
    },
    componentHealth: recoveredIsolatedHealth,
  },

  // ── Draining, window 2 (messaging further along than DB, proving the
  // two recovery-lag subsystems are independently paced): containment
  // engaged, DB already fully drained, messaging partway through its
  // own (slower) drain schedule.
  {
    id: "draining-db-done-msg-window2",
    when: {
      triggerEquals: {
        identityDegraded: true,
        dbFullyDrainedElapsed: true,
        msgDrainWindow2Elapsed: true,
        msgFullyDrainedElapsed: false,
      },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
      },
    },
    incidentState: "draining-window2",
    values: {
      identityValidationLatencyMs: 55,
      identityStatus: "normal",
      identitySuccessRate: 98.8,
      cacheAssistHitRatePercent: 52,
      productBErrorRatePercent: 1.1,
      productBRequestMultiplier: 1.1,
      productAErrorRatePercent: 0.6,
      productAHeldConnectionCount: 35,
      productCErrorRatePercent: 0.3,
      gatewayAdmittedRequestRatePercent: 90,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 180,
      messagingStatus: "warning",
      dbConnectionPoolUtilizationPercent: 50,
      dbStatus: "normal",
      dbWriteSuccessRatePercent: 99.5,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "degraded",
      productBRestorationStatus: "degraded",
      productCRestorationStatus: "normal",
      platformStatus: "draining",
    },
    componentHealth: drainingHealth,
  },

  // ── Draining, window 1 (DB drain window 1 elapsed, messaging only
  // just starting its own drain window 1): earliest real progress on
  // both subsystems, each at ITS OWN pace.
  {
    id: "draining-window1-both",
    when: {
      triggerEquals: {
        identityDegraded: true,
        dbDrainWindow1Elapsed: true,
        msgDrainWindow1Elapsed: true,
        dbFullyDrainedElapsed: false,
      },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
      },
    },
    incidentState: "draining-window1",
    values: {
      identityValidationLatencyMs: 70,
      identityStatus: "normal",
      identitySuccessRate: 97.5,
      cacheAssistHitRatePercent: 48,
      productBErrorRatePercent: 2.0,
      productBRequestMultiplier: 1.3,
      productAErrorRatePercent: 1.2,
      productAHeldConnectionCount: 60,
      productCErrorRatePercent: 0.6,
      gatewayAdmittedRequestRatePercent: 87,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 520,
      messagingStatus: "warning",
      dbConnectionPoolUtilizationPercent: 58,
      dbStatus: "warning",
      dbWriteSuccessRatePercent: 97.5,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "degraded",
      productBRestorationStatus: "degraded",
      productCRestorationStatus: "normal",
      platformStatus: "draining",
    },
    componentHealth: drainingHealth,
  },

  // ── Contained, identity recovering but windows not yet elapsed: real
  // containment engaged (root protected, amplifier contained, DB budget
  // capped), but neither recovery-lag subsystem has had enough elapsed
  // time yet — proves containment alone does not instantly fix
  // anything (recovery lag).
  {
    id: "contained-not-yet-drained",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
      },
    },
    incidentState: "contained",
    values: {
      identityValidationLatencyMs: 180,
      identityStatus: "warning",
      identitySuccessRate: 90,
      cacheAssistHitRatePercent: 44,
      productBErrorRatePercent: 4.5,
      productBRequestMultiplier: 1.6,
      productAErrorRatePercent: 2.5,
      productAHeldConnectionCount: 95,
      productCErrorRatePercent: 1.2,
      gatewayAdmittedRequestRatePercent: 82,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 1_400,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 68,
      dbStatus: "warning",
      dbWriteSuccessRatePercent: 93,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "degraded",
      productBRestorationStatus: "degraded",
      productCRestorationStatus: "normal",
      platformStatus: "contained",
    },
    componentHealth: containedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PARTIAL CONTAINMENT — only one side of the required pair engaged.
  // ══════════════════════════════════════════════════════════════════

  // ── Root protected, DB budget NOT capped: Identity recovers, but
  // Product A's starvation continues unchecked (identity being fast
  // again doesn't stop connections being over-held for OTHER reasons
  // once the pool is already contended) — real partial progress, not
  // the trap (amplifier is not necessarily being actively worsened
  // here), but genuinely incomplete.
  {
    id: "root-protected-db-uncapped",
    when: {
      triggerEquals: { identityDegraded: true, starvationCompounded: true },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "open",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "root-protected-db-exposed",
    values: {
      identityValidationLatencyMs: 50,
      identityStatus: "normal",
      identitySuccessRate: 98,
      cacheAssistHitRatePercent: 50,
      productBErrorRatePercent: 1.8,
      productBRequestMultiplier: 1.2,
      productAErrorRatePercent: 7,
      productAHeldConnectionCount: 175,
      productCErrorRatePercent: 5,
      gatewayAdmittedRequestRatePercent: 85,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 600,
      messagingStatus: "warning",
      dbConnectionPoolUtilizationPercent: 95,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 59,
      cumulativeConnectionExhaustionCount: 260,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "starving",
    },
    componentHealth: wrongRootTrapHealth,
  },

  // ── DB budget capped, root NOT protected (circuit breaker still
  // closed): starvation genuinely stops, but Identity itself remains
  // overwhelmed by unmitigated amplified volume — proves the root
  // dependency must be protected independently of the DB budget lever.
  {
    id: "db-capped-root-unprotected",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
        [DB_CONNECTION_BUDGET_KEY]: "capped",
      },
    },
    incidentState: "db-capped-root-exposed",
    values: {
      identityValidationLatencyMs: 650,
      identityStatus: "critical",
      identitySuccessRate: 63,
      cacheAssistHitRatePercent: 36,
      productBErrorRatePercent: 13,
      productBRequestMultiplier: 2.4,
      productAErrorRatePercent: 3,
      productAHeldConnectionCount: 70,
      productCErrorRatePercent: 7,
      gatewayAdmittedRequestRatePercent: 79,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_600,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 72,
      dbStatus: "warning",
      dbWriteSuccessRatePercent: 91,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PRODUCT A ISOLATED DIRECTLY — stops Product A's OWN held-connection
  // behavior (productAHeldConnectionCount returns to baseline, its own
  // error rate improves) without touching the DB connection budget
  // itself. This genuinely relieves part of the starvation pressure
  // this incident's traffic was causing, but — unlike capping the
  // budget — does nothing to protect the Shared Database from ANY
  // other product's future connection-holding behavior, which is the
  // real, distinct difference from dbConnectionBudget="capped" (see
  // business invariant #1: the structural fix protects every product,
  // isolating one product only fixes this incident).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "product-a-isolated-directly",
    when: {
      triggerEquals: { identityDegraded: true, starvationCompounded: true },
      controlEquals: {
        [PRODUCT_A_ISOLATION_KEY]: "isolated",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "product-a-isolated-directly",
    values: {
      identityValidationLatencyMs: 700,
      identityStatus: "critical",
      identitySuccessRate: 62,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 18,
      productBRequestMultiplier: 2.7,
      productAErrorRatePercent: 0.4,
      productAHeldConnectionCount: 22,
      productCErrorRatePercent: 8,
      gatewayAdmittedRequestRatePercent: 75,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_900,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 78,
      dbStatus: "warning",
      dbWriteSuccessRatePercent: 82,
      cumulativeConnectionExhaustionCount: 10,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "isolated",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // CACHE-ASSIST-ONLY — a real, partial, root-side lever on its own
  // (proves Shared Cache is not a dead/decorative node): reduces
  // validation volume reaching Shared Identity even with the circuit
  // breaker still closed and nothing else engaged, a measurable but
  // incomplete improvement over the plain baseline below.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "cache-assist-only",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [CACHE_ASSIST_POLICY_KEY]: "assist",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
      },
    },
    incidentState: "cache-assist-only",
    values: {
      identityValidationLatencyMs: 420,
      identityStatus: "critical",
      identitySuccessRate: 76,
      cacheAssistHitRatePercent: 68,
      productBErrorRatePercent: 9,
      productBRequestMultiplier: 2.0,
      productAErrorRatePercent: 5,
      productAHeldConnectionCount: 130,
      productCErrorRatePercent: 4.5,
      gatewayAdmittedRequestRatePercent: 85,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_300,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 85,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 73,
      cumulativeConnectionExhaustionCount: 40,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // METADATA DURABILITY TRAP — writes left "normal" (live) while
  // identity correctness is actively degraded: a real, visible
  // durability exposure signal distinct from availability, surfaced via
  // metadataWriteSafety="at-risk" regardless of which other controls
  // are engaged. Covered generically by every "at-risk" value above;
  // this rule exists so METADATA_WRITE_POLICY_KEY is independently
  // exercised turning writes read-only mid-incident without changing
  // anything else, proving it is a real, distinct lever.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "metadata-read-only-only",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [METADATA_WRITE_POLICY_KEY]: "read-only",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "metadata-protected-platform-exposed",
    values: {
      identityValidationLatencyMs: 760,
      identityStatus: "critical",
      identitySuccessRate: 59,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 15,
      productBRequestMultiplier: 2.5,
      productAErrorRatePercent: 5,
      productAHeldConnectionCount: 150,
      productCErrorRatePercent: 8,
      gatewayAdmittedRequestRatePercent: 78,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 1_700,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 91,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 64,
      cumulativeConnectionExhaustionCount: 150,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ASYNC WORKLOAD DEFERRAL — a real, distinct lever on the messaging
  // side on its own: holding new low-priority work back measurably
  // slows backlog growth even before full containment, without
  // discarding any work.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "workload-deferral-only",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [ASYNC_WORKLOAD_DEFERRAL_KEY]: "deferred",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
      },
    },
    incidentState: "deferral-only",
    values: {
      identityValidationLatencyMs: 760,
      identityStatus: "critical",
      identitySuccessRate: 60,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 15,
      productBRequestMultiplier: 2.5,
      productAErrorRatePercent: 5,
      productAHeldConnectionCount: 150,
      productCErrorRatePercent: 8,
      gatewayAdmittedRequestRatePercent: 79,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 980,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 90,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 65,
      cumulativeConnectionExhaustionCount: 145,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNCONTAINED ISOLATION-ONLY OF THE WRONG PRODUCT — isolating Product
  // C (the bystander) does nothing for the platform and costs Product
  // C's own real revenue for no benefit, a distinct, tested
  // misdiagnosis trap from isolating Product B.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "isolate-bystander-wasted",
    when: {
      triggerEquals: { identityDegraded: true, amplificationCompounded: true },
      controlEquals: {
        [PRODUCT_C_ISOLATION_KEY]: "isolated",
        [IDENTITY_CIRCUIT_BREAKER_KEY]: "closed",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
      },
    },
    incidentState: "isolate-bystander-wasted",
    values: {
      identityValidationLatencyMs: 790,
      identityStatus: "critical",
      identitySuccessRate: 58,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 16,
      productBRequestMultiplier: 2.6,
      productAErrorRatePercent: 5,
      productAHeldConnectionCount: 155,
      productCErrorRatePercent: 0.2,
      gatewayAdmittedRequestRatePercent: 77,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_750,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 92,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 60,
      cumulativeConnectionExhaustionCount: 165,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "isolated",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNADDRESSED FAILURE PATH — the incident left completely uncontained
  // all the way through sustainedCascade: Shared Database connection
  // exhaustion has now compounded past the failure threshold. This is
  // the genuine "did nothing for long enough" failure path, distinct
  // from full-cascade-uncontained's earlier, still-recoverable stage.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "sustained-cascade-uncontained-failing",
    when: { triggerEquals: { identityDegraded: true, sustainedCascade: true } },
    incidentState: "full-cascade-unaddressed",
    values: {
      identityValidationLatencyMs: 940,
      identityStatus: "critical",
      identitySuccessRate: 44,
      cacheAssistHitRatePercent: 30,
      productBErrorRatePercent: 31,
      productBRequestMultiplier: 3.8,
      productAErrorRatePercent: 14,
      productAHeldConnectionCount: 260,
      productCErrorRatePercent: 12,
      gatewayAdmittedRequestRatePercent: 60,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 3_400,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 100,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 22,
      cumulativeConnectionExhaustionCount: 980,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "starving",
    },
    componentHealth: fullCascadeHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING DEFAULT — once starvation has compounded, nothing
  // contained at all: full cascade, worse than the earlier root-
  // degrading-only baseline at an earlier point in time.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "full-cascade-uncontained",
    when: { triggerEquals: { identityDegraded: true, starvationCompounded: true } },
    incidentState: "full-cascade",
    values: {
      identityValidationLatencyMs: 880,
      identityStatus: "critical",
      identitySuccessRate: 52,
      cacheAssistHitRatePercent: 33,
      productBErrorRatePercent: 24,
      productBRequestMultiplier: 3.2,
      productAErrorRatePercent: 10,
      productAHeldConnectionCount: 220,
      productCErrorRatePercent: 9,
      gatewayAdmittedRequestRatePercent: 68,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 2_600,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 99,
      dbStatus: "critical",
      dbWriteSuccessRatePercent: 38,
      cumulativeConnectionExhaustionCount: 520,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "starving",
    },
    componentHealth: fullCascadeHealth,
  },

  // ── Amplification compounded, nothing contained yet: the loud signal
  // is now fully compounded but starvation has not yet begun.
  {
    id: "amplification-uncontained",
    when: { triggerEquals: { identityDegraded: true, amplificationCompounded: true } },
    incidentState: "amplifying-uncontained",
    values: {
      identityValidationLatencyMs: 740,
      identityStatus: "critical",
      identitySuccessRate: 61,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 17,
      productBRequestMultiplier: 2.7,
      productAErrorRatePercent: 2,
      productAHeldConnectionCount: 75,
      productCErrorRatePercent: 7,
      gatewayAdmittedRequestRatePercent: 76,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 1_850,
      messagingStatus: "critical",
      dbConnectionPoolUtilizationPercent: 80,
      dbStatus: "warning",
      dbWriteSuccessRatePercent: 78,
      cumulativeConnectionExhaustionCount: 20,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "amplifying",
    },
    componentHealth: rootDegradingHealth,
  },

  // ── BASELINE — identity degraded, nothing else has compounded yet,
  // no action taken. Nothing isolated, no other control touched.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-root-degrading",
    when: { triggerEquals: { identityDegraded: true } },
    incidentState: "baseline-root-degrading",
    values: {
      identityValidationLatencyMs: 420,
      identityStatus: "warning",
      identitySuccessRate: 88,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 3,
      productBRequestMultiplier: 1.4,
      productAErrorRatePercent: 0.5,
      productAHeldConnectionCount: 40,
      productCErrorRatePercent: 0.4,
      gatewayAdmittedRequestRatePercent: 96,
      metadataWriteSafety: "at-risk",
      messagingBacklogCount: 220,
      messagingStatus: "warning",
      dbConnectionPoolUtilizationPercent: 55,
      dbStatus: "normal",
      dbWriteSuccessRatePercent: 99,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "root-degrading",
    },
    componentHealth: rootDegradingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      identityValidationLatencyMs: 40,
      identityStatus: "normal",
      identitySuccessRate: 99.5,
      cacheAssistHitRatePercent: 35,
      productBErrorRatePercent: 0.4,
      productBRequestMultiplier: 1.0,
      productAErrorRatePercent: 0.3,
      productAHeldConnectionCount: 20,
      productCErrorRatePercent: 0.2,
      gatewayAdmittedRequestRatePercent: 100,
      metadataWriteSafety: "safe",
      messagingBacklogCount: 0,
      messagingStatus: "normal",
      dbConnectionPoolUtilizationPercent: 45,
      dbStatus: "normal",
      dbWriteSuccessRatePercent: 100,
      cumulativeConnectionExhaustionCount: 0,
      cumulativeUnverifiedGrantCount: 0,
      productARestorationStatus: "normal",
      productBRestorationStatus: "normal",
      productCRestorationStatus: "normal",
      platformStatus: "healthy",
    },
    componentHealth: healthyHealth,
  },
];
