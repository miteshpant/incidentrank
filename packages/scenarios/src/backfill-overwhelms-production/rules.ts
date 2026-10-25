import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "production-clients": "healthy",
  "application-api": "healthy",
  "primary-database": "healthy",
  "backfill-workers": "healthy",
  "backfill-coordinator": "healthy",
};

const contendedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "application-api": "degraded",
  "primary-database": "critical",
  "backfill-workers": "degraded",
};

const partiallyContendedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "application-api": "degraded",
  "primary-database": "degraded",
};

const integrityViolatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "backfill-coordinator": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "primary-database": "degraded",
};

const resumedDrainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "backfill-workers": "healthy",
  "backfill-coordinator": "healthy",
};

/**
 * Authored rule table for Backfill Overwhelms Production, ordered
 * most-specific-first (first-match-wins, top-to-bottom — see
 * packages/simulator's rule-matching semantics). Hard correctness-
 * violation traps (skip-mark-complete) are checked first — they win
 * regardless of every other control, because skipping historical rows
 * is never acceptable however healthy queue-depth or latency numbers
 * look. Then the required pressure-transfer trap and its partial-
 * protection variants, then safe degraded/paused states, then the real
 * recovery-lag progression toward a safely RESUMED (not merely
 * abandoned) backfill, then baseline.
 *
 * ROOT CAUSE: a large historical backfill (backfillQueueDepth=48,000 at
 * incident start) is already running at low concurrency when live
 * customer traffic enters its daily peak (contentionActive). Both
 * workloads write to the SAME Primary Database — there is no schema
 * incompatibility, no streaming freshness SLO, no multi-tier pipeline;
 * this is pure capacity contention for one shared resource's connection
 * pool and row/table locks, with a real migration deadline creating
 * genuine pressure to keep the backfill moving rather than simply
 * killing it forever.
 *
 * ── REQUIRED PRESSURE-TRANSFER MECHANISM (phase6d.4.md section 14,
 * real authored values) ──────────────────────────────────────────────
 * Raising backfillConcurrency to "high" WITHOUT also shrinking chunk
 * size AND prioritizing live traffic (dbPriorityMode) floods the
 * Primary Database with more concurrent, long-held-lock backfill
 * transactions than live traffic's connection/lock budget can absorb:
 * dbLockWaitMs and liveWriteP99Ms both read MEASURABLY WORSE than the
 * unmitigated baseline, not merely "no better." See
 * "high-concurrency-unmanaged-contention" below, and the two
 * "partial-protection-*" rules proving BOTH levers (chunk size AND
 * priority mode) are independently required, neither alone is
 * sufficient.
 *
 * ── HISTORICAL DAMAGE MODEL (phase6d.4.md section 13 / the business
 * invariant "historical rows must not be skipped or silently marked
 * complete") ──────────────────────────────────────────────────────────
 * skippedRowCount only ever increases while skipMarkComplete is "true"
 * AND a real backfill queue exists to skip rows from. The moment
 * skipMarkComplete is turned back to "false", NO new skips occur — but
 * skippedRowCount is never reset; it freezes at whatever it last
 * reached (see "skip-mark-complete-scarred-live-safe" below, gated on
 * an early, narrow exposure window distinct from sustainedContention,
 * recoveryWindow1/2/FullyStable, and resumeDrainWindow1/2/FullyComplete,
 * so it never overlaps or shadows the real recovery timeline — same
 * technique as Data Pipeline Freshness Collapse's dropExposureWindow).
 *
 * ── RECOVERY LAG (phase6d.4.md section 15) ───────────────────────────
 * Once the candidate has genuinely contained DB pressure (paused, or
 * reshaped backfill + protected live traffic), dbLockWaitMs and
 * liveWriteP99Ms do not snap to healthy on the same tick — they
 * improve across RECOVERY_WINDOW_1/2/FULLY_STABLE. Separately, once
 * production is fully stable AND the backfill has been resumed at a
 * bounded, protected rate, backfillQueueDepth drains toward zero only
 * across RESUME_DRAIN_WINDOW_1/2/FULLY_COMPLETE — never instantly, and
 * never via skip-marking.
 *
 * ── TEMPTING UNSAFE / SUBOPTIMAL PATHS ────────────────────────────────
 *   - skipMarkComplete=true ("just mark the slow ones complete, we have
 *     a deadline"): makes backfillQueueDepth read better almost
 *     immediately, but permanently corrupts the historical record via
 *     skippedRowCount, which can never be undone by any later action.
 *   - backfillConcurrency="high" with none of the protective levers
 *     ("more workers = faster, just turn it up"): the single most
 *     tempting and most harmful response — see pressure-transfer above.
 *   - Permanently abandoning the backfill (paused forever, never
 *     resumed): production stays safe, but the migration deadline is
 *     missed with the backlog never honestly completed — this is
 *     explicitly NOT optimal per the scenario's business invariant that
 *     the deadline matters (see "paused-permanently-abandoned" below,
 *     which the acceptable/optimal tiers never reward beyond the
 *     bounded-but-genuinely-safe "acceptable" tier for a TEMPORARY
 *     pause, never for a backfill that is never resumed at all within
 *     the authored window).
 */
export const backfillOverwhelmsProductionRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAP — skip-mark-complete. Checked first: wins
  // regardless of every other control.
  // ══════════════════════════════════════════════════════════════════
  // Catastrophic sustained exposure: skipMarkComplete left on through
  // the longer recoveryWindow1 elapsed horizon as well — a materially
  // larger, correctness-collapsing total, genuinely crossing the
  // authored failureCondition threshold (skippedRowCount >= 20,000) if
  // sustained this long. Listed before the shorter sustained trap below
  // since it is strictly more specific (also requires
  // recoveryWindow1Elapsed).
  {
    id: "skip-mark-complete-trap-catastrophic",
    when: {
      triggerEquals: {
        contentionActive: true,
        sustainedContention: true,
        skipExposureWindowElapsed: true,
        recoveryWindow1Elapsed: true,
      },
      controlEquals: { [SKIP_MARK_COMPLETE_KEY]: true },
    },
    incidentState: "skip-mark-complete-trap-catastrophic",
    values: {
      requestSuccessRate: 99.4,
      liveWriteP99Ms: 95,
      dbLockWaitMs: 45,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "warning",
      liveConnectionPoolUtilizationPct: 36,
      backfillQueueDepth: 18_000,
      backfillRowsCompletedCount: 8_000,
      backfillStatus: "warning",
      skippedRowCount: 22_000,
      migrationDeadlineDaysRemaining: 8,
      productionDatabaseStatus: "integrity-violated",
    },
    componentHealth: integrityViolatedHealth,
  },
  {
    id: "skip-mark-complete-trap-sustained",
    when: {
      triggerEquals: { contentionActive: true, sustainedContention: true, skipExposureWindowElapsed: true },
      controlEquals: { [SKIP_MARK_COMPLETE_KEY]: true },
    },
    incidentState: "skip-mark-complete-trap-sustained",
    values: {
      requestSuccessRate: 99.5,
      liveWriteP99Ms: 90,
      dbLockWaitMs: 40,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "warning",
      liveConnectionPoolUtilizationPct: 35,
      backfillQueueDepth: 30_000,
      backfillRowsCompletedCount: 6_000,
      backfillStatus: "warning",
      skippedRowCount: 12_000,
      migrationDeadlineDaysRemaining: 9,
      productionDatabaseStatus: "integrity-violated",
    },
    componentHealth: integrityViolatedHealth,
  },
  {
    id: "skip-mark-complete-trap-active",
    when: {
      triggerEquals: { contentionActive: true },
      controlEquals: { [SKIP_MARK_COMPLETE_KEY]: true },
    },
    incidentState: "skip-mark-complete-trap-active",
    values: {
      requestSuccessRate: 99.6,
      liveWriteP99Ms: 85,
      dbLockWaitMs: 30,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "warning",
      liveConnectionPoolUtilizationPct: 30,
      backfillQueueDepth: 40_000,
      backfillRowsCompletedCount: 2_000,
      backfillStatus: "warning",
      skippedRowCount: 4_500,
      migrationDeadlineDaysRemaining: 10,
      productionDatabaseStatus: "integrity-violated",
    },
    componentHealth: integrityViolatedHealth,
  },
  // Scarred-but-live-safe: skipMarkComplete has since been turned back
  // off (no new skips this tick), but skippedRowCount is carried
  // forward unchanged from whatever it last reached — proof the
  // historical counter does not silently reset when the live lever is
  // fixed. Gated on the early, narrow skipExposureWindowElapsed trigger
  // with sustainedContention FALSE, AND on backfillConcurrency still at
  // its pre-incident default ("low") — this additional control
  // constraint is required because this rule's trigger gate alone
  // (elapsed time + skipMarkComplete=false, both true for ANY untouched
  // control state reaching this time window) would otherwise also match
  // — and incorrectly shadow — the unrelated pressure-transfer trap
  // rules below whenever a candidate raises backfillConcurrency without
  // ever touching skipMarkComplete at all, since skipMarkComplete's
  // default is already "false". The real skip-mark-complete-scarred
  // scenario never touches backfillConcurrency, so this constraint does
  // not change its own intended behavior.
  {
    id: "skip-mark-complete-scarred-live-safe",
    when: {
      triggerEquals: {
        contentionActive: true,
        sustainedContention: false,
        skipExposureWindowElapsed: true,
      },
      controlEquals: { [SKIP_MARK_COMPLETE_KEY]: false, [BACKFILL_CONCURRENCY_KEY]: "low" },
    },
    incidentState: "skip-mark-complete-scarred-live-safe",
    values: {
      requestSuccessRate: 99.8,
      liveWriteP99Ms: 80,
      dbLockWaitMs: 15,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 22,
      backfillQueueDepth: 40_000,
      backfillRowsCompletedCount: 2_000,
      backfillStatus: "normal",
      skippedRowCount: 4_500,
      migrationDeadlineDaysRemaining: 10,
      productionDatabaseStatus: "integrity-violated",
    },
    componentHealth: integrityViolatedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // REQUIRED PRESSURE-TRANSFER TRAP — high concurrency, unmanaged.
  // Checked before every safe-scaling rule below (same shape, more
  // specific rules win where applicable).
  // ══════════════════════════════════════════════════════════════════

  // Short statement timeout on top of unmanaged high concurrency:
  // converts queued contention into fast, EXPLICIT live-write failures
  // instead of hidden latency — requestSuccessRate reads materially
  // WORSE (failures are now counted) even though liveWriteP99Ms itself
  // looks bounded, proving short timeout mode is not a free fix for
  // unmanaged contention, only a way to make the failure mode visible.
  // Listed BEFORE the generic unmanaged-contention rule below since it
  // is strictly more specific (also constrains dbStatementTimeoutMode)
  // — the generic rule has no such constraint and would otherwise
  // permanently shadow this one.
  {
    id: "high-concurrency-unmanaged-short-timeout",
    when: {
      triggerEquals: { contentionActive: true },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "large",
        [DB_PRIORITY_MODE_KEY]: "balanced",
        [DB_STATEMENT_TIMEOUT_MODE_KEY]: "short",
      },
    },
    incidentState: "high-concurrency-unmanaged-short-timeout",
    values: {
      requestSuccessRate: 81.0,
      liveWriteP99Ms: 1_900,
      dbLockWaitMs: 1_900,
      liveWriteTimeoutFailureCount: 640,
      primaryDatabaseStatus: "critical",
      liveConnectionPoolUtilizationPct: 90,
      backfillQueueDepth: 36_000,
      backfillRowsCompletedCount: 12_000,
      backfillStatus: "warning",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 9,
      productionDatabaseStatus: "contending",
    },
    componentHealth: contendedHealth,
  },
  {
    id: "high-concurrency-unmanaged-contention",
    when: {
      triggerEquals: { contentionActive: true },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "large",
        [DB_PRIORITY_MODE_KEY]: "balanced",
      },
    },
    incidentState: "high-concurrency-unmanaged-contention",
    values: {
      requestSuccessRate: 94.0,
      liveWriteP99Ms: 2_400,
      dbLockWaitMs: 2_100,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "critical",
      liveConnectionPoolUtilizationPct: 92,
      backfillQueueDepth: 36_000,
      backfillRowsCompletedCount: 12_000,
      backfillStatus: "warning",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 9,
      productionDatabaseStatus: "contending",
    },
    componentHealth: contendedHealth,
  },

  // ── Partial protection: chunk size shrunk alone (priority still
  // balanced) — meaningfully reduces lock-hold duration per transaction,
  // but live traffic still has no reserved budget, so contention is
  // reduced, not eliminated. Listed before the generic catch-all above
  // would otherwise shadow it (more specific: constrains chunk size).
  {
    id: "high-concurrency-partial-protection-chunk-only",
    when: {
      triggerEquals: { contentionActive: true },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "small",
        [DB_PRIORITY_MODE_KEY]: "balanced",
      },
    },
    incidentState: "high-concurrency-partial-protection-chunk-only",
    values: {
      requestSuccessRate: 97.5,
      liveWriteP99Ms: 650,
      dbLockWaitMs: 520,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 70,
      backfillQueueDepth: 34_000,
      backfillRowsCompletedCount: 14_000,
      backfillStatus: "warning",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 9,
      productionDatabaseStatus: "contending",
    },
    componentHealth: partiallyContendedHealth,
  },
  // ── Partial protection: priority mode alone (chunk still large) —
  // live traffic gets a reserved floor of budget, but each in-progress
  // backfill transaction still holds locks for a long wall-clock
  // duration once it does run, so contention is reduced, not
  // eliminated, proving BOTH levers are independently required.
  {
    id: "high-concurrency-partial-protection-priority-only",
    when: {
      triggerEquals: { contentionActive: true },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "large",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
      },
    },
    incidentState: "high-concurrency-partial-protection-priority-only",
    values: {
      requestSuccessRate: 98.0,
      liveWriteP99Ms: 480,
      dbLockWaitMs: 410,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 55,
      backfillQueueDepth: 35_000,
      backfillRowsCompletedCount: 13_000,
      backfillStatus: "warning",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 9,
      productionDatabaseStatus: "contending",
    },
    componentHealth: partiallyContendedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE DEGRADED STATE — pause the backfill entirely. Production
  // recovers (over real elapsed recovery windows), queue is BOUNDED and
  // FROZEN (not shrinking, never silently emptied), migration delayed
  // but safe. This is the scenario's named "likely safe degraded
  // state."
  // ══════════════════════════════════════════════════════════════════
  {
    id: "paused-recovering-window1",
    when: {
      triggerEquals: { contentionActive: true, recoveryWindow1Elapsed: true, recoveryWindowFullyStableElapsed: false },
      controlEquals: { [BACKFILL_PAUSE_RESUME_KEY]: "paused" },
    },
    incidentState: "paused-recovering-window1",
    values: {
      requestSuccessRate: 99.9,
      liveWriteP99Ms: 140,
      dbLockWaitMs: 60,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 24,
      backfillQueueDepth: 40_000,
      backfillRowsCompletedCount: 2_000,
      backfillStatus: "paused",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 8,
      productionDatabaseStatus: "protected",
    },
    componentHealth: recoveringHealth,
  },
  {
    id: "paused-fully-stable",
    when: {
      triggerEquals: { contentionActive: true, recoveryWindowFullyStableElapsed: true },
      controlEquals: { [BACKFILL_PAUSE_RESUME_KEY]: "paused" },
    },
    incidentState: "paused-fully-stable",
    values: {
      requestSuccessRate: 99.95,
      liveWriteP99Ms: 80,
      dbLockWaitMs: 0,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 20,
      backfillQueueDepth: 40_000,
      backfillRowsCompletedCount: 2_000,
      backfillStatus: "paused",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 6,
      productionDatabaseStatus: "protected",
    },
    componentHealth: healthyHealth,
  },
  // ── Just-paused tick-zero proof: pause flipped this instant (no
  // elapsed recovery window yet) — dbLockWaitMs/liveWriteP99Ms are
  // exactly where they were the moment pause was engaged, proving
  // recovery is not instant.
  {
    id: "paused-just-engaged",
    when: {
      triggerEquals: { contentionActive: true, recoveryWindow1Elapsed: false },
      controlEquals: { [BACKFILL_PAUSE_RESUME_KEY]: "paused" },
    },
    incidentState: "paused-just-engaged",
    values: {
      requestSuccessRate: 96.0,
      liveWriteP99Ms: 900,
      dbLockWaitMs: 780,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 50,
      backfillQueueDepth: 42_000,
      backfillRowsCompletedCount: 1_200,
      backfillStatus: "paused",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 10,
      productionDatabaseStatus: "protected",
    },
    componentHealth: recoveringHealth,
  },

  // ── Off-peak scheduling alone (backfill still "running" at whatever
  // concurrency, but confined to the low-traffic window): a real,
  // distinct, legitimate way to protect production without pausing
  // forever. Checked before the medium/low baseline-contention rules
  // since it is more specific (constrains schedulingWindow explicitly).
  {
    id: "off-peak-scheduling-protects-production",
    when: {
      triggerEquals: { contentionActive: true },
      controlEquals: { [BACKFILL_SCHEDULING_WINDOW_KEY]: "off-peak-only" },
    },
    incidentState: "off-peak-scheduling-protects-production",
    values: {
      requestSuccessRate: 99.85,
      liveWriteP99Ms: 95,
      dbLockWaitMs: 10,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 21,
      backfillQueueDepth: 44_000,
      backfillRowsCompletedCount: 800,
      backfillStatus: "throttled",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 8,
      productionDatabaseStatus: "protected",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE PROGRESSION TOWARD OPTIMAL — fully protected high concurrency
  // (small chunk + live-traffic-first priority + throttled dispatch):
  // the strong path. Production protected immediately; backfill
  // genuinely drains toward honest completion only over the resume-
  // drain windows, which themselves only matter once production has
  // been stabilized for a full recovery window first.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: fully protected, dispatch throttled, production fully
  // stable AND the backfill fully, honestly drained.
  {
    id: "fully-resumed-complete",
    when: {
      triggerEquals: {
        contentionActive: true,
        recoveryWindowFullyStableElapsed: true,
        resumeDrainFullyCompleteElapsed: true,
      },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "small",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
        [QUEUE_DISPATCH_RATE_KEY]: "throttled",
        [SKIP_MARK_COMPLETE_KEY]: false,
      },
    },
    incidentState: "fully-resumed-complete",
    values: {
      requestSuccessRate: 99.9,
      liveWriteP99Ms: 85,
      dbLockWaitMs: 10,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 35,
      backfillQueueDepth: 0,
      backfillRowsCompletedCount: 48_000,
      backfillStatus: "complete",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 1,
      productionDatabaseStatus: "complete-honest",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE / safe-resume progress: fully protected AND dispatch
  // throttled, production stable, backfill resumed and genuinely
  // draining (bounded, shrinking queue) but not yet fully complete.
  {
    id: "safely-resumed-draining-window2",
    when: {
      triggerEquals: {
        contentionActive: true,
        recoveryWindowFullyStableElapsed: true,
        resumeDrainWindow2Elapsed: true,
        resumeDrainFullyCompleteElapsed: false,
      },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "small",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
        [QUEUE_DISPATCH_RATE_KEY]: "throttled",
        [SKIP_MARK_COMPLETE_KEY]: false,
      },
    },
    incidentState: "safely-resumed-draining-window2",
    values: {
      requestSuccessRate: 99.85,
      liveWriteP99Ms: 110,
      dbLockWaitMs: 25,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 38,
      backfillQueueDepth: 9_000,
      backfillRowsCompletedCount: 39_000,
      backfillStatus: "draining",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 3,
      productionDatabaseStatus: "safely-resumed",
    },
    componentHealth: resumedDrainingHealth,
  },
  {
    id: "safely-resumed-draining-window1",
    when: {
      triggerEquals: {
        contentionActive: true,
        recoveryWindowFullyStableElapsed: true,
        resumeDrainWindow1Elapsed: true,
        resumeDrainWindow2Elapsed: false,
      },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "small",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
        [QUEUE_DISPATCH_RATE_KEY]: "throttled",
        [SKIP_MARK_COMPLETE_KEY]: false,
      },
    },
    incidentState: "safely-resumed-draining-window1",
    values: {
      requestSuccessRate: 99.8,
      liveWriteP99Ms: 120,
      dbLockWaitMs: 35,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 40,
      backfillQueueDepth: 24_000,
      backfillRowsCompletedCount: 24_000,
      backfillStatus: "draining",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 5,
      productionDatabaseStatus: "safely-resumed",
    },
    componentHealth: resumedDrainingHealth,
  },
  // ── Just-resumed tick-zero proof: fully protected configuration
  // flipped this instant (no elapsed resume-drain window yet) — queue
  // depth is exactly where it was at the moment of resume, proving the
  // drain is not instant.
  {
    id: "safely-resumed-just-engaged",
    when: {
      triggerEquals: {
        contentionActive: true,
        recoveryWindowFullyStableElapsed: true,
        resumeDrainWindow1Elapsed: false,
      },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "small",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
        [QUEUE_DISPATCH_RATE_KEY]: "throttled",
        [SKIP_MARK_COMPLETE_KEY]: false,
      },
    },
    incidentState: "safely-resumed-just-engaged",
    values: {
      requestSuccessRate: 99.8,
      liveWriteP99Ms: 130,
      dbLockWaitMs: 40,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 42,
      backfillQueueDepth: 40_000,
      backfillRowsCompletedCount: 2_000,
      backfillStatus: "draining",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 6,
      productionDatabaseStatus: "safely-resumed",
    },
    componentHealth: resumedDrainingHealth,
  },

  // ── Dispatch throttle as the ONE lever that keeps a protected-but-not-
  // fully-combined configuration from re-saturating via raw dispatch
  // rate: fully protected EXCEPT dispatch left unthrottled — queue
  // dispatch itself (independent of worker count) pushes more chunks
  // into flight than the Primary Database's incoming transaction rate
  // safely absorbs, which measurably worsens dbLockWaitMs relative to
  // the fully-protected-and-throttled rule above, proving
  // queueDispatchRate is a real, distinct lever rather than redundant
  // with backfillConcurrency.
  {
    id: "protected-but-dispatch-unthrottled",
    when: {
      triggerEquals: { contentionActive: true, recoveryWindowFullyStableElapsed: true },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "high",
        [BACKFILL_CHUNK_SIZE_KEY]: "small",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
        [QUEUE_DISPATCH_RATE_KEY]: "unthrottled",
      },
    },
    incidentState: "protected-but-dispatch-unthrottled",
    values: {
      requestSuccessRate: 98.6,
      liveWriteP99Ms: 520,
      dbLockWaitMs: 440,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 78,
      backfillQueueDepth: 20_000,
      backfillRowsCompletedCount: 28_000,
      backfillStatus: "draining",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 4,
      productionDatabaseStatus: "contending",
    },
    componentHealth: partiallyContendedHealth,
  },

  // ── Medium concurrency, fully protected: a safer, slower alternate
  // strong path — never pushes contention as high as "high" concurrency
  // would even unprotected, genuinely safe, but drains more slowly
  // (lower backfillRowsCompletedCount at the same elapsed time than the
  // "high" fully-protected path above at an equivalent window).
  {
    id: "medium-concurrency-protected",
    when: {
      triggerEquals: { contentionActive: true, recoveryWindowFullyStableElapsed: true },
      controlEquals: {
        [BACKFILL_CONCURRENCY_KEY]: "medium",
        [DB_PRIORITY_MODE_KEY]: "live-traffic-first",
      },
    },
    incidentState: "medium-concurrency-protected",
    values: {
      requestSuccessRate: 99.9,
      liveWriteP99Ms: 95,
      dbLockWaitMs: 15,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 30,
      backfillQueueDepth: 30_000,
      backfillRowsCompletedCount: 18_000,
      backfillStatus: "draining",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 5,
      productionDatabaseStatus: "safely-resumed",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — contention active, no meaningful action taken yet (low
  // concurrency is the pre-incident default and is itself insufficient
  // to drain the backlog quickly, but is NOT the pressure-transfer
  // trap, since it never ramped in the first place).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-contention",
    when: { triggerEquals: { contentionActive: true, sustainedContention: true } },
    incidentState: "baseline-sustained-contention",
    values: {
      requestSuccessRate: 98.8,
      liveWriteP99Ms: 340,
      dbLockWaitMs: 260,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 58,
      backfillQueueDepth: 46_000,
      backfillRowsCompletedCount: 2_000,
      backfillStatus: "warning",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 9,
      productionDatabaseStatus: "contending",
    },
    componentHealth: partiallyContendedHealth,
  },
  {
    id: "baseline-contention",
    when: { triggerEquals: { contentionActive: true } },
    incidentState: "baseline-contention",
    values: {
      requestSuccessRate: 99.2,
      liveWriteP99Ms: 220,
      dbLockWaitMs: 160,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "degraded",
      liveConnectionPoolUtilizationPct: 45,
      backfillQueueDepth: 47_000,
      backfillRowsCompletedCount: 1_000,
      backfillStatus: "warning",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 10,
      productionDatabaseStatus: "contending",
    },
    componentHealth: partiallyContendedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99.8,
      liveWriteP99Ms: 80,
      dbLockWaitMs: 0,
      liveWriteTimeoutFailureCount: 0,
      primaryDatabaseStatus: "normal",
      liveConnectionPoolUtilizationPct: 20,
      backfillQueueDepth: 48_000,
      backfillRowsCompletedCount: 0,
      backfillStatus: "normal",
      skippedRowCount: 0,
      migrationDeadlineDaysRemaining: 10,
      productionDatabaseStatus: "protected",
    },
    componentHealth: healthyHealth,
  },
];
