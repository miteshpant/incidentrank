import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "api-gateway": "healthy",
  "migration-layer": "healthy",
  "legacy-service": "healthy",
  "new-service": "healthy",
  "legacy-db": "healthy",
  "new-db": "healthy",
  reconciliation: "healthy",
};

const divergingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "migration-layer": "critical",
  "legacy-db": "degraded",
  "new-db": "degraded",
  reconciliation: "degraded",
};

const frozenDrainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "migration-layer": "degraded",
  reconciliation: "degraded",
};

const correctnessViolatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "migration-layer": "critical",
  "legacy-db": "critical",
  "new-db": "critical",
  reconciliation: "critical",
};

const repairContentionHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "new-service": "degraded",
  "new-db": "degraded",
  reconciliation: "degraded",
};

/**
 * Authored rule table for API Migration Dual-Write Failure, ordered
 * most-specific first.
 *
 * Business invariants (stated in the candidate briefing — see
 * api-migration-dual-write-failure.ts): exactly one authoritative write
 * source during containment; acknowledged writes must not disappear
 * during rollback; rollback does not automatically repair data already
 * written only to New; read routing must not expose unresolved
 * divergent state; migration safety outranks rollout velocity.
 *
 * ── HISTORICAL DAMAGE MODEL ─────────────────────────────────────────
 * unreconciledDivergentRecordCount / newOnlyUnreconciledRecordCount are
 * modeled as monotonic-while-active counters via a sequence of
 * authored snapshots keyed to elapsed trigger-time windows (the same
 * technique Multi-Region Payment Platform Degradation and Distributed
 * Coordination Failure use for non-formulaic accumulation): while
 * writeMode stays "dual", the later-firing timedEvents
 * (divergenceEscalated) match progressively larger authored counts for
 * the SAME "still dual-writing" rule family, so the count visibly
 * climbs over real elapsed time without any runtime arithmetic. The
 * instant writeMode leaves "dual" (legacy-only or new-only), every rule
 * below freezes that count at whatever it was the tick authority
 * changed — never resets it — and only reconciliationMode ===
 * "diff-and-repair", run for the full authored window
 * (reconciliationWindowElapsed), drains it to zero. Rollback and
 * migrationDirection never touch this field.
 *
 * ── PRESSURE TRANSFER (required) ────────────────────────────────────
 * repairPriority: "critical-first" drains the backlog faster but
 * dedicates New DB write capacity to repair work, measurably raising
 * newServiceWriteLatencyMs for live migration traffic — and the effect
 * compounds if rolloutPercent is simultaneously pushed up while
 * critical-first repair is running, since more live write volume then
 * competes with the same dedicated repair capacity. See
 * "draining-critical-first-high-rollout-contention" below for the
 * authored numbers proving this.
 *
 * ── SHADOW TRAFFIC WARM-UP (shadowTraffic) ──────────────────────────
 * shadowTraffic shadow-writes to New in the background without
 * granting it write/read authority — a pure diagnostic/warm-up signal
 * that cannot by itself stop or repair anything (see controls.ts). Its
 * one real, traced effect: having it enabled BEFORE pushing
 * rolloutPercent up while still dual-writing measurably reduces how
 * much worse that rollout increase makes divergence, because New
 * Service's write path has already been exercised/validated by shadow
 * traffic ahead of the real cohort switch, lowering the odds of a
 * fresh asymmetric-write outcome on the newly-migrated share of
 * traffic. It does NOT make raising rollout while dual-writing safe or
 * free of cost — "aggressive-rollout-increase-with-shadow-warmup"
 * below still accumulates strictly more divergence than leaving
 * rollout unchanged ("dual-write-unmitigated-baseline"), and strictly
 * less than raising rollout cold without shadow traffic
 * ("aggressive-rollout-increase-accelerates-divergence"). It is a real,
 * partial mitigant on an already-authored harmful lever, never a
 * substitute for freezing write mode or reconciling.
 *
 * ── THE NAMED UNSAFE SEQUENCE (mandatory, phase6d.2.md section 11) ──
 * rollbackApplicationTraffic=true -> newOnlyUnreconciledRecordCount
 * still > 0 -> readSource="legacy". This exposes/loses exactly the
 * New-only writes that were never reconciled: a real, counted
 * correctness violation (exposedDivergentReadCount,
 * silentlyLostAcknowledgedWriteCount), even though requestSuccessRate
 * stays high the whole time. See "unsafe-sequence-rollback-before-
 * reconcile" below.
 */
export const apiMigrationDualWriteFailureRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE — correctness violations. Checked first: once one of these
  // hard violations has occurred, correctnessStatus is pinned to
  // "violated" for the state and never silently heals within the
  // incident, regardless of what the candidate does afterward in the
  // same tick's control combination.
  // ══════════════════════════════════════════════════════════════════

  // ── Same unsafe sequence, intermediate magnitude: caught earlier
  // (before divergence has escalated to its worse rate) but still a
  // real violation — the mechanism is about ORDER, not magnitude, so
  // even the smaller divergence population reachable before
  // divergenceEscalated fires is still a genuine, nonzero loss. Checked
  // BEFORE the general/escalated variant below since it additionally
  // constrains divergenceEscalated — the more specific match must win.
  {
    id: "unsafe-sequence-rollback-before-reconcile-early",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: false },
      controlEquals: {
        [ROLLBACK_APPLICATION_TRAFFIC_KEY]: true,
        [READ_SOURCE_KEY]: "legacy",
        [RECONCILIATION_MODE_KEY]: "off",
      },
    },
    incidentState: "unsafe-sequence-rollback-before-reconcile-early",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 140,
      newOnlyUnreconciledRecordCount: 85,
      exposedDivergentReadCount: 20,
      silentlyLostAcknowledgedWriteCount: 85,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 90,
      reconciliationQueueDepth: 140,
      correctnessStatus: "violated",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: correctnessViolatedHealth,
  },

  // ── THE NAMED UNSAFE SEQUENCE: application traffic rolled back to
  // Legacy, New-only unreconciled writes still exist, and reads have
  // been switched to Legacy. This looks maximally available
  // (requestSuccessRate stays at 99 — Legacy is healthy and serving
  // everything) but every acknowledged write that only ever landed on
  // New during the dual-write window is now invisible to every read.
  {
    id: "unsafe-sequence-rollback-before-reconcile",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true },
      controlEquals: {
        [ROLLBACK_APPLICATION_TRAFFIC_KEY]: true,
        [READ_SOURCE_KEY]: "legacy",
        [RECONCILIATION_MODE_KEY]: "off",
      },
    },
    incidentState: "unsafe-sequence-rollback-before-reconcile",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 340,
      newOnlyUnreconciledRecordCount: 210,
      exposedDivergentReadCount: 58,
      silentlyLostAcknowledgedWriteCount: 210,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 90,
      reconciliationQueueDepth: 340,
      correctnessStatus: "violated",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: correctnessViolatedHealth,
  },

  // ── UNSAFE: reads switched to "cohort" (the default) while rollback
  // has been applied — rollback forces all WRITE traffic through
  // Legacy, but cohort read routing still sends a share of READS to
  // New for accounts in the New cohort. Those New-cohort reads are now
  // reading a source that can no longer receive any further writes at
  // all (rollback stopped them) while genuinely still holding
  // historical New-only records Legacy has never seen — a second,
  // distinct flavor of "read routing must not expose unresolved
  // divergent state."
  {
    id: "unsafe-sequence-rollback-cohort-reads-exposed",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true },
      controlEquals: {
        [ROLLBACK_APPLICATION_TRAFFIC_KEY]: true,
        [READ_SOURCE_KEY]: "cohort",
        [RECONCILIATION_MODE_KEY]: "off",
      },
    },
    incidentState: "unsafe-sequence-rollback-cohort-exposed",
    values: {
      requestSuccessRate: 98,
      unreconciledDivergentRecordCount: 340,
      newOnlyUnreconciledRecordCount: 210,
      exposedDivergentReadCount: 44,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 90,
      reconciliationQueueDepth: 340,
      correctnessStatus: "violated",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: correctnessViolatedHealth,
  },

  // ── UNSAFE/tempting: replay-blind reconciliation. The raw divergence
  // COUNT drops fast (looks like real progress) but the mechanism
  // mechanically overwrites/duplicates records without checking for a
  // genuine conflict first — blindReplayCorruptionCount climbs as real,
  // distinct data-integrity damage layered on top of the original
  // divergence. This is the tempting-but-harmful "repair" path: it is
  // the ONLY reconciliation mode that moves fast, which is exactly what
  // makes it tempting under incident pressure.
  {
    id: "replay-blind-corrupts-data",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true },
      controlEquals: { [RECONCILIATION_MODE_KEY]: "replay-blind" },
    },
    incidentState: "replay-blind-corrupts-data",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 40,
      newOnlyUnreconciledRecordCount: 10,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 95,
      newServiceWriteLatencyMs: 140,
      reconciliationQueueDepth: 40,
      correctnessStatus: "violated",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "dual",
    },
    componentHealth: correctnessViolatedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNSAFE — unbounded accumulation (not yet an exposure/loss event,
  // but new damage is still actively happening). Must never be
  // classified acceptable/optimal regardless of availability.
  // ══════════════════════════════════════════════════════════════════

  // ── SHADOW TRAFFIC WARM-UP: the same aggressive-rollout-while-
  // dual-writing lever, but with shadowTraffic having already been
  // warming up New Service's write path before rollout was pushed up.
  // This is a real, partial, measurable mitigation of the harmful
  // lever above — strictly less divergence than raising rollout cold
  // (compare "aggressive-rollout-increase-accelerates-divergence" at
  // 210/95 vs this rule's 165/75 at the SAME trigger window) — but
  // strictly MORE than leaving rollout unchanged altogether (compare
  // "dual-write-unmitigated-baseline" at 120/55). Checked BEFORE the
  // cold variant below since it is the more specific match
  // (shadowTraffic=true); the cold variant is itself now scoped to
  // shadowTraffic=false so the two families never overlap.
  {
    id: "aggressive-rollout-increase-with-shadow-warmup",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: false },
      controlEquals: { [WRITE_MODE_KEY]: "dual", [SHADOW_TRAFFIC_KEY]: true },
      controlAtLeast: { [ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "aggressive-rollout-increase-with-shadow-warmup",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 165,
      newOnlyUnreconciledRecordCount: 75,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 150,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },
  {
    id: "aggressive-rollout-increase-with-shadow-warmup-escalated",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: true },
      controlEquals: { [WRITE_MODE_KEY]: "dual", [SHADOW_TRAFFIC_KEY]: true },
      controlAtLeast: { [ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "aggressive-rollout-increase-with-shadow-warmup-escalated",
    values: {
      requestSuccessRate: 98,
      unreconciledDivergentRecordCount: 400,
      newOnlyUnreconciledRecordCount: 185,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 180,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },

  // ── Harmful/tempting: rollout percent pushed UP while still
  // dual-writing and already diverging, WITHOUT shadow-traffic warm-up
  // — "make migration progress" while the correctness problem is still
  // open. More concurrent dual-write attempts means more chances for
  // an asymmetric outcome: this measurably accelerates divergence
  // growth versus leaving rollout unchanged at the same elapsed point
  // (compare to "dual-write-unmitigated-baseline" below at the same
  // trigger window), and is itself measurably worse than the
  // shadow-warmed variant above at the same trigger window.
  {
    id: "aggressive-rollout-increase-accelerates-divergence",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: false },
      controlEquals: { [WRITE_MODE_KEY]: "dual", [SHADOW_TRAFFIC_KEY]: false },
      controlAtLeast: { [ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "aggressive-rollout-increase-accelerates-divergence",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 210,
      newOnlyUnreconciledRecordCount: 95,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 150,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },
  {
    id: "aggressive-rollout-increase-accelerates-divergence-escalated",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: true },
      controlEquals: { [WRITE_MODE_KEY]: "dual", [SHADOW_TRAFFIC_KEY]: false },
      controlAtLeast: { [ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "aggressive-rollout-increase-accelerates-divergence-escalated",
    values: {
      requestSuccessRate: 98,
      unreconciledDivergentRecordCount: 520,
      newOnlyUnreconciledRecordCount: 240,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 180,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },

  // ── Baseline/no-action: dual-write left exactly as the incident
  // started it. Divergence accumulates at the ambient rate (lower than
  // the aggressive-rollout-increase path above at the same trigger
  // window — proving the rollout lever has a REAL, distinct effect,
  // not a cosmetic one).
  {
    id: "dual-write-unmitigated-baseline",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: false },
      controlEquals: { [WRITE_MODE_KEY]: "dual" },
    },
    incidentState: "dual-write-unmitigated-baseline",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 120,
      newOnlyUnreconciledRecordCount: 55,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 90,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },
  {
    id: "dual-write-unmitigated-escalated",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, divergenceEscalated: true },
      controlEquals: { [WRITE_MODE_KEY]: "dual" },
    },
    incidentState: "dual-write-unmitigated-escalated",
    values: {
      requestSuccessRate: 98,
      unreconciledDivergentRecordCount: 300,
      newOnlyUnreconciledRecordCount: 140,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 100,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // CONTAINED — new divergence has stopped (writeMode frozen off
  // "dual"), but the historical backlog is nonzero. This family is
  // the FROZEN baseline: write authority is single-sourced, so
  // unreconciledDivergentRecordCount holds at whatever value it was
  // when the freeze happened (authored here as the escalated-window
  // value, modeling "the candidate froze it late") and does not shrink
  // on its own, with no reconciliation running.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "frozen-no-reconciliation-legacy-authoritative",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true },
      controlEquals: {
        [WRITE_MODE_KEY]: "legacy-only",
        [RECONCILIATION_MODE_KEY]: "off",
      },
    },
    incidentState: "frozen-no-reconciliation-legacy-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 300,
      newOnlyUnreconciledRecordCount: 140,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 70,
      reconciliationQueueDepth: 0,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: frozenDrainingHealth,
  },
  {
    id: "frozen-no-reconciliation-new-authoritative",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true },
      controlEquals: {
        [WRITE_MODE_KEY]: "new-only",
        [RECONCILIATION_MODE_KEY]: "off",
      },
    },
    incidentState: "frozen-no-reconciliation-new-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 300,
      newOnlyUnreconciledRecordCount: 140,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 95,
      reconciliationQueueDepth: 0,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "new-only",
    },
    componentHealth: frozenDrainingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // DRAINING-EARLY — diff-and-repair has just started (write authority
  // frozen too), but reconciliationPartiallyDrained has not fired yet.
  // RECOVERY LAG, made real: the backlog is already shrinking versus
  // the frozen-no-reconciliation ceiling of 300 (proving reconciliation
  // is doing real, distinct work from the very first tick), but it has
  // NOT yet drained far enough to cross the acceptable-tier's bounded
  // threshold (<=100) — a candidate cannot reach "acceptable" merely by
  // flipping reconciliationMode on; real elapsed reconciliation time
  // must actually pass first.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "draining-early-legacy-authoritative",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, reconciliationPartiallyDrained: false },
      controlEquals: {
        [WRITE_MODE_KEY]: "legacy-only",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
      },
    },
    incidentState: "draining-early-legacy-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 220,
      newOnlyUnreconciledRecordCount: 100,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 100,
      reconciliationQueueDepth: 220,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: frozenDrainingHealth,
  },
  {
    id: "draining-early-new-authoritative",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, reconciliationPartiallyDrained: false },
      controlEquals: {
        [WRITE_MODE_KEY]: "new-only",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
      },
    },
    incidentState: "draining-early-new-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 220,
      newOnlyUnreconciledRecordCount: 100,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 125,
      reconciliationQueueDepth: 220,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "new-only",
    },
    componentHealth: frozenDrainingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // DRAINING — write authority frozen AND diff-and-repair running AND
  // reconciliationPartiallyDrained has fired (a real, fixed amount of
  // elapsed reconciliation time has passed), but
  // reconciliationWindowElapsed has not fired yet. Real, bounded,
  // nonzero backlog that is ACTIVELY shrinking versus BOTH the frozen-
  // no-reconciliation numbers AND the draining-early numbers above at
  // comparable elapsed points — proving reconciliation is a real,
  // distinct, time-dependent mechanism, never an instant snap. This is
  // the ACCEPTABLE tier's primary gate: new damage stopped, correctness
  // protected, backlog bounded (<=100) and demonstrably draining.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "draining-normal-priority-legacy-authoritative",
    when: {
      triggerEquals: {
        dualWriteDivergenceActive: true,
        reconciliationPartiallyDrained: true,
        reconciliationWindowElapsed: false,
      },
      controlEquals: {
        [WRITE_MODE_KEY]: "legacy-only",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [REPAIR_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "draining-normal-priority-legacy-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 95,
      newOnlyUnreconciledRecordCount: 40,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 110,
      reconciliationQueueDepth: 95,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: frozenDrainingHealth,
  },
  {
    id: "draining-normal-priority-new-authoritative",
    when: {
      triggerEquals: {
        dualWriteDivergenceActive: true,
        reconciliationPartiallyDrained: true,
        reconciliationWindowElapsed: false,
      },
      controlEquals: {
        [WRITE_MODE_KEY]: "new-only",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [REPAIR_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "draining-normal-priority-new-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 95,
      newOnlyUnreconciledRecordCount: 40,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 135,
      reconciliationQueueDepth: 95,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "new-only",
    },
    componentHealth: frozenDrainingHealth,
  },

  // ── PRESSURE TRANSFER (required, real numbers): critical-first
  // repair priority drains the backlog faster (lower
  // reconciliationQueueDepth/unreconciledDivergentRecordCount than the
  // "normal" priority rules above at the SAME elapsed point) but
  // dedicates New DB write capacity to repair work, which measurably
  // raises newServiceWriteLatencyMs. The effect compounds further when
  // rolloutPercent is simultaneously kept high (>= 75): more live
  // migration write volume is now competing for the same dedicated
  // repair capacity, pushing latency higher still than critical-first
  // alone at lower rollout.
  {
    id: "draining-critical-first-new-authoritative",
    when: {
      triggerEquals: {
        dualWriteDivergenceActive: true,
        reconciliationPartiallyDrained: true,
        reconciliationWindowElapsed: false,
      },
      controlEquals: {
        [WRITE_MODE_KEY]: "new-only",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [REPAIR_PRIORITY_KEY]: "critical-first",
      },
      controlAtMost: { [ROLLOUT_PERCENT_KEY]: 50 },
    },
    incidentState: "draining-critical-first-new-authoritative",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 55,
      newOnlyUnreconciledRecordCount: 20,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 220,
      reconciliationQueueDepth: 55,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "new-only",
    },
    componentHealth: repairContentionHealth,
  },
  {
    id: "draining-critical-first-high-rollout-contention",
    when: {
      triggerEquals: {
        dualWriteDivergenceActive: true,
        reconciliationPartiallyDrained: true,
        reconciliationWindowElapsed: false,
      },
      controlEquals: {
        [WRITE_MODE_KEY]: "new-only",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [REPAIR_PRIORITY_KEY]: "critical-first",
      },
      controlAtLeast: { [ROLLOUT_PERCENT_KEY]: 75 },
    },
    incidentState: "draining-critical-first-high-rollout-contention",
    values: {
      requestSuccessRate: 97,
      unreconciledDivergentRecordCount: 50,
      newOnlyUnreconciledRecordCount: 18,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 310,
      reconciliationQueueDepth: 50,
      correctnessStatus: "contained",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "warning",
      authoritativeWriteSource: "new-only",
    },
    componentHealth: repairContentionHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // OPTIMAL — reconciliationWindowElapsed=true AND diff-and-repair has
  // been running the whole window AND write authority is single-
  // sourced: the historical backlog is now fully drained to zero. Two
  // distinct, equally legitimate final strategic directions:
  //   - rollback-legacy: fully reconciled, then declare Legacy
  //     authoritative permanently (abandon the migration safely).
  //   - continue-new: fully reconciled, then declare New authoritative
  //     at full rollout (complete the migration safely).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fully-reconciled-rollback-legacy",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, reconciliationWindowElapsed: true },
      controlEquals: {
        [WRITE_MODE_KEY]: "legacy-only",
        [READ_SOURCE_KEY]: "legacy",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [MIGRATION_DIRECTION_KEY]: "rollback-legacy",
      },
    },
    incidentState: "fully-reconciled-rollback-legacy",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 0,
      newOnlyUnreconciledRecordCount: 0,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 70,
      reconciliationQueueDepth: 0,
      correctnessStatus: "safe",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "normal",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-reconciled-continue-new",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, reconciliationWindowElapsed: true },
      controlEquals: {
        [WRITE_MODE_KEY]: "new-only",
        [READ_SOURCE_KEY]: "new",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [MIGRATION_DIRECTION_KEY]: "continue-new",
      },
      controlAtLeast: { [ROLLOUT_PERCENT_KEY]: 100 },
    },
    incidentState: "fully-reconciled-continue-new",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 0,
      newOnlyUnreconciledRecordCount: 0,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 95,
      reconciliationQueueDepth: 0,
      correctnessStatus: "safe",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "normal",
      authoritativeWriteSource: "new-only",
    },
    componentHealth: healthyHealth,
  },

  // ── Fully reconciled (window elapsed, backlog drained to zero) but
  // NO strategic direction has been declared yet — write authority is
  // single-sourced and safe, correctness is fully restored, but the
  // candidate has not yet committed to rollback-legacy or
  // continue-new. Genuinely safe right now (matches the acceptable
  // bar), but not the fully-declared optimal end state.
  {
    id: "fully-reconciled-undeclared-legacy",
    when: {
      triggerEquals: { dualWriteDivergenceActive: true, reconciliationWindowElapsed: true },
      controlEquals: {
        [WRITE_MODE_KEY]: "legacy-only",
        [READ_SOURCE_KEY]: "legacy",
        [RECONCILIATION_MODE_KEY]: "diff-and-repair",
        [MIGRATION_DIRECTION_KEY]: "undecided",
      },
    },
    incidentState: "fully-reconciled-undeclared",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 0,
      newOnlyUnreconciledRecordCount: 0,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 70,
      reconciliationQueueDepth: 0,
      correctnessStatus: "safe",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "normal",
      authoritativeWriteSource: "legacy-only",
    },
    componentHealth: healthyHealth,
  },

  // ── Fallback while dual-write divergence is active but the
  // candidate has not yet reached any of the specific authored
  // combinations above (e.g. write mode frozen but reconciliation
  // toggled on and off between partial control changes). Reflects a
  // partially-managed, still-unresolved middle ground.
  {
    id: "divergence-active-unmanaged",
    when: { triggerEquals: { dualWriteDivergenceActive: true } },
    incidentState: "divergence-active-unmanaged",
    values: {
      requestSuccessRate: 98,
      unreconciledDivergentRecordCount: 300,
      newOnlyUnreconciledRecordCount: 140,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 100,
      reconciliationQueueDepth: 0,
      correctnessStatus: "unresolved",
      dataIntegrityProtected: "not-protected",
      writeAuthorityRiskStatus: "critical",
      authoritativeWriteSource: "dual",
    },
    componentHealth: divergingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99,
      unreconciledDivergentRecordCount: 0,
      newOnlyUnreconciledRecordCount: 0,
      exposedDivergentReadCount: 0,
      silentlyLostAcknowledgedWriteCount: 0,
      blindReplayCorruptionCount: 0,
      newServiceWriteLatencyMs: 90,
      reconciliationQueueDepth: 0,
      correctnessStatus: "safe",
      dataIntegrityProtected: "protected",
      writeAuthorityRiskStatus: "normal",
      authoritativeWriteSource: "dual",
    },
    componentHealth: healthyHealth,
  },
];
