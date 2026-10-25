import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "old-app-fleet": "healthy",
  "new-app-fleet": "healthy",
  "shared-database": "healthy",
  "backfill-workers": "healthy",
};

const diverging: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "new-app-fleet": "degraded",
  "shared-database": "degraded",
};

const correctnessViolatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "old-app-fleet": "critical",
  "new-app-fleet": "critical",
  "shared-database": "critical",
};

const lockContentionHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "new-app-fleet": "degraded",
  "shared-database": "critical",
  "backfill-workers": "degraded",
};

const frozenDrainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shared-database": "degraded",
  "backfill-workers": "degraded",
};

const frozenUnrepairedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shared-database": "degraded",
};

/**
 * Authored rule table for Schema Migration Under Live Traffic, ordered
 * most-specific-first (hard correctness-violation traps checked before
 * pressure/capacity states, which are checked before the ordinary
 * progression of stop-creating-incompatible-rows -> backfill -> verify).
 *
 * Business invariants (stated in the candidate briefing — see
 * schema-migration-under-live-traffic.ts): rows written during mixed-
 * version operation must remain readable by the currently-serving
 * fleet; acknowledged writes may not be discarded to make rollback
 * easier; the rollout may be paused/slowed; backfill completion is less
 * important than customer correctness; the database must not be left in
 * a state only one app version can interpret unless traffic has been
 * safely fenced to that version.
 *
 * ROOT CAUSE: New App Fleet is already serving real traffic
 * (appRolloutPercent=50 at incident start) while compatibilityWriteMode
 * is still "legacy-shape" — New App Fleet's own code needs the new
 * field to behave correctly, so it writes rows carrying ONLY the new
 * field, which Old App Fleet (still serving the other half of traffic)
 * cannot safely interpret. requestSuccessRate stays high throughout —
 * this must not look like an availability outage.
 *
 * ── HISTORICAL DAMAGE MODEL (phase6d3.md section 12) ─────────────────
 * newShapeOnlyRowCount only grows while compatibilityWriteMode is
 * "legacy-shape" or "new-shape-only" (both leave one fleet's shape
 * unpopulated) AND compatibilityBrokenActive is true. The moment
 * compatibilityWriteMode becomes "dual-shape", every rule below freezes
 * the count at whatever it was when the tick authority changed (keyed
 * on which escalation trigger was ever active, mirroring
 * ledger-reconciliation-divergence's sustainedDivergence technique) —
 * never resets it. Only backfillConcurrency != "off", run for a real
 * authored elapsed window (backfillPartiallyDrained /
 * backfillWindowElapsed), drains it toward zero.
 *
 * ── PRESSURE TRANSFER (required, real numbers) ────────────────────────
 * backfillConcurrency="high" drains the backlog faster but dedicates
 * materially more Shared Database lock/write capacity to backfill scan/
 * rewrite work, raising dbLockWaitMs for live traffic — worse while
 * dbLockTimeoutMode stays "normal" (short: live writes fail outright
 * instead of merely waiting, lockTimeoutFailureCount climbs), and
 * compounded further by retryPolicy="aggressive" (more write attempts
 * competing for the same held locks). See the pressure-transfer rule
 * family below for the authored numbers.
 *
 * ── TEMPTING UNSAFE PATHS ─────────────────────────────────────────────
 *   - rollbackAppFleet=true while new-shape-only rows already exist and
 *     compatibilityWriteMode is still "legacy-shape": looks maximally
 *     safe and fast (Old App Fleet is healthy, requestSuccessRate stays
 *     high) but strands every new-shape-only row behind a fleet that
 *     cannot interpret it — unreadableByServingFleetCount becomes real
 *     and nonzero. See "unsafe-sequence-rollback-before-repair" below —
 *     this is the MIGRATION QA REQUIRED scenario (phase6d3.md section
 *     23): the identical final control tuple
 *     {rollbackAppFleet:true, compatibilityWriteMode:"dual-shape",
 *      appRolloutPercent:0} is SAFE if dual-shape+backfill ran to full
 *     drain BEFORE rollback, and UNSAFE if rollback happened first,
 *     while compatibilityWriteMode was still "legacy-shape" — same
 *     final configuration, different history, different safety.
 *   - appRolloutPercent >= 75 while compatibilityWriteMode is still
 *     "legacy-shape" and the incompatibility is already active
 *     ("continue rollout to finish faster"): accelerates
 *     newShapeOnlyRowCount growth versus leaving rollout unchanged.
 *   - migrationPhase="contract" before the historical backlog is fully
 *     backfilled: drops the legacy field from the schema while rows
 *     still depend on it existing, discarding exactly the acknowledged
 *     data the "no discarding to ease rollback" invariant protects —
 *     discardedAcknowledgedWriteCount becomes real and nonzero,
 *     regardless of which fleet is currently serving.
 */
export const schemaMigrationUnderLiveTrafficRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE — hard correctness violations. Checked first.
  // ══════════════════════════════════════════════════════════════════

  // ── Contract-too-early trap: dropping the legacy field while the
  // historical backlog has not been backfilled discards acknowledged
  // data outright, regardless of which fleet is serving. Checked before
  // the rollback trap since it is a strictly different invariant
  // violation with its own control signature.
  {
    id: "unsafe-contract-before-backfill-sustained",
    when: {
      triggerEquals: {
        compatibilityBrokenActive: true,
        compatibilityEscalated: true,
        backfillWindowElapsed: false,
      },
      controlEquals: { [MIGRATION_PHASE_KEY]: "contract" },
    },
    incidentState: "unsafe-contract-before-backfill-sustained",
    values: {
      requestSuccessRate: 98,
      newShapeOnlyRowCount: 300,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 220,
      dbLockWaitMs: 60,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "violated",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: correctnessViolatedHealth,
  },
  {
    id: "unsafe-contract-before-backfill",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillWindowElapsed: false },
      controlEquals: { [MIGRATION_PHASE_KEY]: "contract" },
    },
    incidentState: "unsafe-contract-before-backfill",
    values: {
      requestSuccessRate: 98,
      newShapeOnlyRowCount: 120,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 95,
      dbLockWaitMs: 55,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "violated",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: correctnessViolatedHealth,
  },

  // ── THE NAMED UNSAFE SEQUENCE / MIGRATION QA (phase6d3.md section
  // 23): rollback applied while compatibilityWriteMode is still
  // "legacy-shape" (new-shape-only rows exist and were never given a
  // legacy fallback). This looks maximally available
  // (requestSuccessRate stays high — Old App Fleet is healthy and now
  // serving everyone) but every row New App Fleet wrote new-shape-only
  // is now being served to a fleet that cannot interpret it.
  {
    id: "unsafe-sequence-rollback-before-repair-sustained",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, compatibilityEscalated: true },
      controlEquals: {
        [ROLLBACK_APP_FLEET_KEY]: true,
        [COMPATIBILITY_WRITE_MODE_KEY]: "legacy-shape",
      },
    },
    incidentState: "unsafe-sequence-rollback-before-repair-sustained",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 300,
      unreadableByServingFleetCount: 300,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "violated",
      migrationRiskStatus: "critical",
      servingFleetMode: "old-only",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: correctnessViolatedHealth,
  },
  // Same unsafe sequence, intermediate magnitude: caught earlier (before
  // escalation), still a real, nonzero violation — the mechanism is
  // about ORDER, not magnitude.
  {
    id: "unsafe-sequence-rollback-before-repair-early",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, compatibilityEscalated: false },
      controlEquals: {
        [ROLLBACK_APP_FLEET_KEY]: true,
        [COMPATIBILITY_WRITE_MODE_KEY]: "legacy-shape",
      },
    },
    incidentState: "unsafe-sequence-rollback-before-repair-early",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 120,
      unreadableByServingFleetCount: 120,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "violated",
      migrationRiskStatus: "critical",
      servingFleetMode: "old-only",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: correctnessViolatedHealth,
  },
  // Rollback applied while compatibilityWriteMode is "new-shape-only"
  // (the opposite-direction strand): Old App Fleet is rolled BACK to
  // serve, but rows were written new-shape-only with no legacy
  // fallback — same violation mechanism, opposite migration direction.
  {
    id: "unsafe-sequence-rollback-new-shape-only",
    when: {
      triggerEquals: { compatibilityBrokenActive: true },
      controlEquals: {
        [ROLLBACK_APP_FLEET_KEY]: true,
        [COMPATIBILITY_WRITE_MODE_KEY]: "new-shape-only",
      },
    },
    incidentState: "unsafe-sequence-rollback-new-shape-only",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 300,
      unreadableByServingFleetCount: 300,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "violated",
      migrationRiskStatus: "critical",
      servingFleetMode: "old-only",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: correctnessViolatedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNSAFE — unbounded accumulation (not yet a hard violation, but new
  // damage is still actively happening). Must never be classified
  // acceptable/optimal regardless of availability.
  // ══════════════════════════════════════════════════════════════════

  // ── Harmful/tempting: "continue rollout to finish faster" while
  // compatibility is still broken. More concurrent New App Fleet
  // traffic means more new-shape-only rows created per unit time —
  // measurably worse than leaving rollout unchanged at the same
  // trigger window (compare to "compatibility-broken-baseline" below).
  {
    id: "aggressive-rollout-continues-while-broken",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, compatibilityEscalated: false },
      controlEquals: { [COMPATIBILITY_WRITE_MODE_KEY]: "legacy-shape" },
      controlAtLeast: { [APP_ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "aggressive-rollout-continues-while-broken",
    values: {
      requestSuccessRate: 98,
      newShapeOnlyRowCount: 210,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 50,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "unresolved",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: diverging,
  },
  {
    id: "aggressive-rollout-continues-while-broken-escalated",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, compatibilityEscalated: true },
      controlEquals: { [COMPATIBILITY_WRITE_MODE_KEY]: "legacy-shape" },
      controlAtLeast: { [APP_ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "aggressive-rollout-continues-while-broken-escalated",
    values: {
      requestSuccessRate: 97,
      newShapeOnlyRowCount: 520,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 60,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "unresolved",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: diverging,
  },

  // ── Baseline/no-action: compatibility left exactly as the incident
  // started it. New-shape-only rows accumulate at the ambient rate
  // (lower than the aggressive-rollout path above at the same trigger
  // window — proving appRolloutPercent has a REAL, distinct effect).
  {
    id: "compatibility-broken-baseline",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, compatibilityEscalated: false },
      controlEquals: { [COMPATIBILITY_WRITE_MODE_KEY]: "legacy-shape" },
    },
    incidentState: "compatibility-broken-baseline",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 120,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "unresolved",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: diverging,
  },
  {
    id: "compatibility-broken-escalated",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, compatibilityEscalated: true },
      controlEquals: { [COMPATIBILITY_WRITE_MODE_KEY]: "legacy-shape" },
    },
    incidentState: "compatibility-broken-escalated",
    values: {
      requestSuccessRate: 98,
      newShapeOnlyRowCount: 300,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 45,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "unresolved",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: diverging,
  },

  // ══════════════════════════════════════════════════════════════════
  // CONTAINED — new incompatible rows have stopped (compatibilityWriteMode
  // is "dual-shape"), but the historical backlog is nonzero and frozen
  // unless backfill is actively running.
  // ══════════════════════════════════════════════════════════════════

  // ── REQUIRED PRESSURE TRANSFER: backfillConcurrency="high" while
  // dbLockTimeoutMode stays "normal" (short) -- live writes fail
  // outright on lock contention instead of merely waiting longer.
  // Checked before the ordinary draining family since it is the most
  // specific (and worst-latency) combination.
  {
    id: "backfill-high-lock-contention-normal-timeout",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillPartiallyDrained: false },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [DB_LOCK_TIMEOUT_MODE_KEY]: "normal",
        [RETRY_POLICY_KEY]: "normal",
      },
    },
    incidentState: "backfill-high-lock-contention-normal-timeout",
    values: {
      requestSuccessRate: 94,
      newShapeOnlyRowCount: 220,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 340,
      lockTimeoutFailureCount: 45,
      backfillRepairedRowCount: 80,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: lockContentionHealth,
  },
  // Same combination, but AFTER the partial-drain recovery-lag
  // checkpoint has elapsed: backfillRepairedRowCount has climbed
  // further and the backlog is lower than the early window above, but
  // normal (short) lock timeout is STILL converting contention into
  // outright write failures rather than merely added latency — proving
  // dbLockTimeoutMode (not just elapsed time) determines whether the
  // pressure transfer shows up as failures or latency.
  {
    id: "backfill-high-lock-contention-normal-timeout-bounded",
    when: {
      triggerEquals: {
        compatibilityBrokenActive: true,
        backfillPartiallyDrained: true,
        backfillWindowElapsed: false,
      },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [DB_LOCK_TIMEOUT_MODE_KEY]: "normal",
        [RETRY_POLICY_KEY]: "normal",
      },
    },
    incidentState: "backfill-high-lock-contention-normal-timeout-bounded",
    values: {
      requestSuccessRate: 95,
      newShapeOnlyRowCount: 40,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 320,
      lockTimeoutFailureCount: 60,
      backfillRepairedRowCount: 180,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: lockContentionHealth,
  },
  // Same high-concurrency backfill, but retryPolicy="aggressive" layered
  // on top: the documented interacting symptom -- retries increase
  // write pressure further, compounding lock contention beyond
  // high-backfill-alone.
  {
    id: "backfill-high-lock-contention-aggressive-retries",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillPartiallyDrained: false },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [DB_LOCK_TIMEOUT_MODE_KEY]: "normal",
        [RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "backfill-high-lock-contention-aggressive-retries",
    values: {
      requestSuccessRate: 90,
      newShapeOnlyRowCount: 220,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 520,
      lockTimeoutFailureCount: 95,
      backfillRepairedRowCount: 80,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: lockContentionHealth,
  },
  // Same aggressive-retries combination, after the partial-drain
  // checkpoint — still worse than the normal-retry bounded variant
  // above at the same elapsed window.
  {
    id: "backfill-high-lock-contention-aggressive-retries-bounded",
    when: {
      triggerEquals: {
        compatibilityBrokenActive: true,
        backfillPartiallyDrained: true,
        backfillWindowElapsed: false,
      },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [DB_LOCK_TIMEOUT_MODE_KEY]: "normal",
        [RETRY_POLICY_KEY]: "aggressive",
      },
    },
    incidentState: "backfill-high-lock-contention-aggressive-retries-bounded",
    values: {
      requestSuccessRate: 88,
      newShapeOnlyRowCount: 40,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 560,
      lockTimeoutFailureCount: 130,
      backfillRepairedRowCount: 180,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: lockContentionHealth,
  },
  // High-concurrency backfill but PAIRED CORRECTLY with
  // dbLockTimeoutMode="extended": the pressure transfer is absorbed as
  // added latency (still elevated) rather than outright write failures
  // -- lockTimeoutFailureCount stays at 0, proving dbLockTimeoutMode is
  // a real, distinct, non-dead control.
  {
    id: "backfill-high-extended-timeout-absorbs-pressure",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillPartiallyDrained: false },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [DB_LOCK_TIMEOUT_MODE_KEY]: "extended",
      },
    },
    incidentState: "backfill-high-extended-timeout-absorbs-pressure",
    values: {
      requestSuccessRate: 98,
      newShapeOnlyRowCount: 220,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 300,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 80,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: frozenDrainingHealth,
  },

  // ── DRAINING-EARLY: dual-shape active AND backfillConcurrency=low,
  // before backfillPartiallyDrained has fired. RECOVERY LAG, made real:
  // the backlog is already shrinking versus the frozen-no-backfill
  // ceiling (proving backfill does real, distinct work from the very
  // first tick), but has not yet drained far enough to cross the
  // acceptable-tier's bounded threshold.
  {
    id: "draining-early-low-concurrency",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillPartiallyDrained: false },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "low",
      },
    },
    incidentState: "draining-early-low-concurrency",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 180,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 70,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 40,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: frozenDrainingHealth,
  },

  // ── FROZEN, UNREPAIRED: dual-shape stops NEW incompatible rows, but
  // backfillConcurrency is "off" -- the backlog sits frozen, unmoving,
  // however long the candidate waits. The key UNSAFE-but-tempting state:
  // it LOOKS calm (no new damage, dual-shape is healthy-looking) but
  // newShapeOnlyRowCount never drains without active backfill.
  {
    id: "frozen-dual-shape-no-backfill",
    when: {
      triggerEquals: { compatibilityBrokenActive: true },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "off",
      },
    },
    incidentState: "frozen-dual-shape-no-backfill",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 300,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: frozenUnrepairedHealth,
  },

  // ── DRAINING (bounded, ACCEPTABLE-tier gate): backfillPartiallyDrained
  // has fired AND backfill is actively running (low or high) AND
  // dual-shape is active. Real, bounded, nonzero backlog that is
  // ACTIVELY shrinking -- the archetype "bounded and draining" state.
  {
    id: "draining-bounded-low-concurrency",
    when: {
      triggerEquals: {
        compatibilityBrokenActive: true,
        backfillPartiallyDrained: true,
        backfillWindowElapsed: false,
      },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "low",
      },
    },
    incidentState: "draining-bounded-low-concurrency",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 85,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 75,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 135,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: frozenDrainingHealth,
  },
  {
    id: "draining-bounded-high-concurrency",
    when: {
      triggerEquals: {
        compatibilityBrokenActive: true,
        backfillPartiallyDrained: true,
        backfillWindowElapsed: false,
      },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [DB_LOCK_TIMEOUT_MODE_KEY]: "extended",
      },
    },
    incidentState: "draining-bounded-high-concurrency",
    values: {
      requestSuccessRate: 97,
      newShapeOnlyRowCount: 40,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 260,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 180,
      compatibilityStatus: "contained",
      migrationRiskStatus: "warning",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: lockContentionHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // OPTIMAL — backfillWindowElapsed=true AND dual-shape has been active
  // the whole window: the historical backlog has fully drained to zero
  // with no violation ever having occurred. Two distinct, equally
  // legitimate final strategic directions once safe:
  //   - roll back cleanly: fence onto Old App Fleet only, now provably
  //     safe because every row is readable by it (dual-shape + fully
  //     repaired).
  //   - complete the rollout: fence onto New App Fleet only
  //     (appRolloutPercent=100), move to new-shape-only + contract,
  //     now provably safe because Old App Fleet has been safely fenced
  //     away first.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fully-repaired-safe-rollback",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillWindowElapsed: true },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [ROLLBACK_APP_FLEET_KEY]: true,
        [MIGRATION_PHASE_KEY]: "expand",
      },
    },
    incidentState: "fully-repaired-safe-rollback",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 0,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 220,
      compatibilityStatus: "safe",
      migrationRiskStatus: "normal",
      servingFleetMode: "old-only",
      dataIntegrityProtected: "protected",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-repaired-safe-forward-complete",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillWindowElapsed: true },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "new-shape-only",
        [ROLLBACK_APP_FLEET_KEY]: false,
        [MIGRATION_PHASE_KEY]: "contract",
      },
      controlAtLeast: { [APP_ROLLOUT_PERCENT_KEY]: 100 },
    },
    incidentState: "fully-repaired-safe-forward-complete",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 0,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 220,
      compatibilityStatus: "safe",
      migrationRiskStatus: "normal",
      servingFleetMode: "new-only",
      dataIntegrityProtected: "protected",
    },
    componentHealth: healthyHealth,
  },
  // Fully repaired (window elapsed, backlog drained to zero) but no
  // strategic direction declared yet -- genuinely safe right now
  // (matches the acceptable bar via dual-shape + zero backlog), but not
  // the fully-declared optimal end state.
  {
    id: "fully-repaired-undeclared",
    when: {
      triggerEquals: { compatibilityBrokenActive: true, backfillWindowElapsed: true },
      controlEquals: {
        [COMPATIBILITY_WRITE_MODE_KEY]: "dual-shape",
        [ROLLBACK_APP_FLEET_KEY]: false,
        [MIGRATION_PHASE_KEY]: "expand",
      },
    },
    incidentState: "fully-repaired-undeclared",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 0,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 220,
      compatibilityStatus: "safe",
      migrationRiskStatus: "normal",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: healthyHealth,
  },

  // ── Fallback while compatibility is broken but the candidate has not
  // reached any specific authored combination above (e.g. toggled
  // controls between partial changes). Reflects a partially-managed,
  // still-unresolved middle ground.
  {
    id: "compatibility-broken-unmanaged",
    when: { triggerEquals: { compatibilityBrokenActive: true } },
    incidentState: "compatibility-broken-unmanaged",
    values: {
      requestSuccessRate: 98,
      newShapeOnlyRowCount: 300,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 45,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "unresolved",
      migrationRiskStatus: "critical",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "not-protected",
    },
    componentHealth: diverging,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99,
      newShapeOnlyRowCount: 0,
      unreadableByServingFleetCount: 0,
      discardedAcknowledgedWriteCount: 0,
      dbLockWaitMs: 40,
      lockTimeoutFailureCount: 0,
      backfillRepairedRowCount: 0,
      compatibilityStatus: "safe",
      migrationRiskStatus: "normal",
      servingFleetMode: "mixed",
      dataIntegrityProtected: "protected",
    },
    componentHealth: healthyHealth,
  },
];
