import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "global-clients": "healthy",
  "traffic-router": "healthy",
  "feature-flag-platform": "healthy",
  "us-service-fleet": "healthy",
  "eu-service-fleet": "healthy",
  "apac-service-fleet": "healthy",
  "shared-data-store": "healthy",
};

const divergingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-service-fleet": "degraded",
  "shared-data-store": "degraded",
};

const wideningHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-service-fleet": "degraded",
  "eu-service-fleet": "critical",
  "apac-service-fleet": "degraded",
  "shared-data-store": "critical",
};

const containedUnreadableHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "feature-flag-platform": "degraded",
  "shared-data-store": "degraded",
};

const repairingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shared-data-store": "degraded",
};

const racingRepairHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-service-fleet": "degraded",
  "shared-data-store": "critical",
};

/**
 * Authored rule table for Global Feature Rollout Incident, ordered
 * most-specific-first (correctness traps and racing-repair hazards
 * checked before contained-but-unrepaired states, which are checked
 * before ordinary progression toward full repair/compatibility).
 *
 * Business invariants (stated in the candidate briefing — see
 * global-feature-rollout-incident.ts): correctly-written existing
 * customer state must remain readable after rollback; a regional
 * rollout may be halted independently; global rollback may not discard
 * or hide already-written incompatible data; the shared data store must
 * not contain mutually incompatible active representations without an
 * explicit compatibility strategy; correctness outranks rollout
 * velocity.
 *
 * ROOT CAUSE: the global feature rollout writes a NEW representation for
 * affected customer records while writeCompatibilityMode stays
 * "new-only" — any region still interpreting the OLD representation (or
 * any read path without an engaged compatibility shim) cannot correctly
 * read those records. requestSuccessRate stays high throughout — this
 * must not look like a generic availability outage (contrast
 * deployment-regression / partial-rollout-regression / schema-migration-
 * under-live-traffic, none of which have more than one independently-
 * controlled regional fleet diverging by REGION rather than by version).
 * EU is first to expose the divergence (its rollout timing surfaces the
 * mismatch before US/APAC do); each region's correctness can move
 * independently once halted/rolled back, since each region's rollout
 * state is an independent control.
 *
 * ── HISTORICAL DAMAGE MODEL (phase6d.4.md section 13, required) ──────
 * alreadyIncompatibleWriteCount only grows while writeCompatibilityMode
 * is "new-only" AND at least one region is actively "rolled-out" AND
 * globalRollback is false. The moment every growth condition stops
 * (every region halted, or rolloutPause/globalRollback engaged, or
 * dual-write engaged), every rule below freezes the count at whatever it
 * was — it is NEVER decremented by rollback, pause, or halting alone.
 * Only migrationRepair="repairing", run for a real elapsed window
 * (repairWindow1Elapsed / repairFullyDone) while NOT racing concurrent
 * new-only writes, actually reduces the gap between
 * alreadyIncompatibleWriteCount and repairedRecordCount.
 *
 * ── SEQUENCING TRAP (required, real measurable correctness gap) ──────
 * Rolling back/halting BEFORE repairing already-incompatible writes
 * stops the backlog from growing but leaves unreadableReadCount
 * climbing against the stale backlog in strict read mode — a real,
 * measurable correctness gap distinct from "fixed." Repairing first (or
 * engaging the read-compatibility shim) before/while rolling back avoids
 * this gap. See "rollback-no-repair-contained-unreadable" below.
 *
 * ── RACING-REPAIR TRAP (Principal-level judgment, not in the spec's
 * literal list but required by this scenario's own correctness logic):
 * running migrationRepair while a region is STILL actively writing
 * new-only means repair is reconciling records that keep getting
 * re-written incompatible behind it — the backlog never actually
 * shrinks net, wasting real elapsed time and cost for zero correctness
 * gain. Repair is only genuinely effective once new incompatible writes
 * have stopped growing (every region halted/paused, or dual-write
 * engaged, or globalRollback engaged).
 *
 * ── PRESSURE TRANSFER (required, real numbers) ────────────────────────
 * Halting/rolling back converts a growing-write-incompatibility problem
 * into a growing-READ-incompatibility problem: unreadableReadCount keeps
 * climbing against the frozen backlog in strict mode even though
 * alreadyIncompatibleWriteCount itself has stopped growing. See the
 * rollback-no-repair-contained-unreadable rule family below for the
 * authored numbers.
 *
 * ── ALTERNATE STRONG PATHS (both independently reach OPTIMAL) ────────
 *   1. Regional rollback + repair: halt the affected region(s) (or
 *      global rollback) to stop growth, THEN engage migrationRepair and
 *      let the full repair window elapse.
 *   2. Global rollback + compatibility: globalRollback=true AND
 *      dataReadCompatibilityMode="compatibility-shim" — stops growth and
 *      makes every already-written record readable via read-time
 *      translation, without waiting for the full repair window.
 * A third documented path (forward-fix: dual-write + staged continuation)
 * is implemented as a genuine CONTAINED/ACCEPTABLE tier, not optimal —
 * see the completion-mode audit in definition.ts for why.
 */
export const globalFeatureRolloutIncidentRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // RACING-REPAIR TRAP — repair engaged while incompatible writes are
  // still actively growing. Checked first: this is strictly worse than
  // simply doing nothing, because it burns the repair-cost budget for
  // zero net correctness gain while the regression keeps spreading.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "racing-repair-against-active-writes",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [MIGRATION_REPAIR_KEY]: "repairing",
        [REGION_ROLLOUT_EU_KEY]: "rolled-out",
        [WRITE_COMPATIBILITY_MODE_KEY]: "new-only",
        [GLOBAL_ROLLBACK_KEY]: false,
        [ROLLOUT_PAUSE_KEY]: false,
      },
    },
    incidentState: "racing-repair",
    values: {
      requestSuccessRate: 99.4,
      euCorrectnessRate: 70,
      usCorrectnessRate: 92,
      apacCorrectnessRate: 94,
      alreadyIncompatibleWriteCount: 340,
      repairedRecordCount: 0,
      unreadableReadCount: 60,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: racingRepairHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING TRAP — rollback/halt engaged, but repair was never run
  // first. Growth stops, but reads against the frozen backlog keep
  // failing in strict read mode. This is the scenario's required
  // "rollback alone leaves a real measurable correctness gap" proof.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "global-rollback-no-repair-sustained-unreadable",
    when: {
      triggerEquals: { rolloutRegressionActive: true, sustainedRollout: true },
      controlEquals: {
        [GLOBAL_ROLLBACK_KEY]: true,
        [MIGRATION_REPAIR_KEY]: "idle",
        [DATA_READ_COMPATIBILITY_MODE_KEY]: "strict",
      },
    },
    incidentState: "rollback-no-repair-unreadable",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 35,
      usCorrectnessRate: 60,
      apacCorrectnessRate: 65,
      // Frozen at exactly sustained-widening's authored count (980) —
      // the real value the backlog had reached at the moment rollback
      // was engaged, never a different, arbitrary number. This is what
      // proves rollback genuinely freezes rather than silently
      // recomputing the historical count.
      alreadyIncompatibleWriteCount: 980,
      repairedRecordCount: 0,
      unreadableReadCount: 540,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "rolled-back",
    },
    componentHealth: containedUnreadableHealth,
  },
  {
    id: "global-rollback-no-repair-unreadable",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [GLOBAL_ROLLBACK_KEY]: true,
        [MIGRATION_REPAIR_KEY]: "idle",
        [DATA_READ_COMPATIBILITY_MODE_KEY]: "strict",
      },
    },
    incidentState: "rollback-no-repair-unreadable",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 62,
      usCorrectnessRate: 85,
      apacCorrectnessRate: 88,
      alreadyIncompatibleWriteCount: 180,
      repairedRecordCount: 0,
      unreadableReadCount: 95,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "rolled-back",
    },
    componentHealth: containedUnreadableHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH 2 — global rollback + read-compatibility shim.
  // Growth stops AND already-written records become readable via
  // read-time translation, without waiting for the full repair window.
  // repairedRecordCount stays 0 (nothing was actually rewritten — the
  // shim translates at read time, it does not reconcile the underlying
  // rows), but unreadableReadCount returns to 0 immediately: this is a
  // genuinely different mechanism than alternate path 1, not a decoy.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "global-rollback-with-compatibility-shim",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [GLOBAL_ROLLBACK_KEY]: true,
        [DATA_READ_COMPATIBILITY_MODE_KEY]: "compatibility-shim",
      },
    },
    incidentState: "rollback-with-shim",
    values: {
      requestSuccessRate: 99.7,
      euCorrectnessRate: 100,
      usCorrectnessRate: 100,
      apacCorrectnessRate: 100,
      alreadyIncompatibleWriteCount: 180,
      repairedRecordCount: 0,
      unreadableReadCount: 0,
      storeCompatibilityStatus: "compatible",
      rolloutStatus: "rolled-back",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH 1 — growth stopped first (halt/pause/rollback
  // or dual-write), THEN repair actually engaged (not racing). Repair
  // climbs across real elapsed windows toward the frozen backlog, never
  // instantly. unreadableReadCount shrinks in proportion to repaired
  // coverage even in strict mode, since repaired records are genuinely
  // rewritten rather than merely translated.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "repair-fully-done-growth-stopped",
    when: {
      triggerEquals: { rolloutRegressionActive: true, repairFullyDone: true },
      controlEquals: {
        [MIGRATION_REPAIR_KEY]: "repairing",
        [REGION_ROLLOUT_EU_KEY]: "halted",
        [GLOBAL_ROLLBACK_KEY]: false,
      },
    },
    incidentState: "repaired-fully",
    values: {
      requestSuccessRate: 99.7,
      euCorrectnessRate: 100,
      usCorrectnessRate: 100,
      apacCorrectnessRate: 100,
      alreadyIncompatibleWriteCount: 220,
      repairedRecordCount: 220,
      unreadableReadCount: 0,
      storeCompatibilityStatus: "compatible",
      rolloutStatus: "regionally-halted",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "repair-fully-done-global-rollback",
    when: {
      triggerEquals: { rolloutRegressionActive: true, repairFullyDone: true },
      controlEquals: {
        [MIGRATION_REPAIR_KEY]: "repairing",
        [GLOBAL_ROLLBACK_KEY]: true,
      },
    },
    incidentState: "repaired-fully",
    values: {
      requestSuccessRate: 99.7,
      euCorrectnessRate: 100,
      usCorrectnessRate: 100,
      apacCorrectnessRate: 100,
      alreadyIncompatibleWriteCount: 180,
      repairedRecordCount: 180,
      unreadableReadCount: 0,
      storeCompatibilityStatus: "compatible",
      rolloutStatus: "rolled-back",
    },
    componentHealth: healthyHealth,
  },
  // ── Repair just engaged, growth stopped (EU halted), but no real
  // repair-progress window has elapsed yet — proves repair does not
  // jump to any progress on the same tick it is engaged (recovery lag).
  {
    id: "repair-just-started-growth-stopped-eu",
    when: {
      triggerEquals: { rolloutRegressionActive: true, repairWindow1Elapsed: false },
      controlEquals: { [MIGRATION_REPAIR_KEY]: "repairing", [REGION_ROLLOUT_EU_KEY]: "halted" },
    },
    incidentState: "repair-just-started",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 62,
      usCorrectnessRate: 90,
      apacCorrectnessRate: 92,
      alreadyIncompatibleWriteCount: 220,
      repairedRecordCount: 0,
      unreadableReadCount: 60,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "regionally-halted",
    },
    componentHealth: repairingHealth,
  },
  // ── Repair just engaged, growth stopped (global rollback), but no
  // real repair-progress window has elapsed yet.
  {
    id: "repair-just-started-growth-stopped-rollback",
    when: {
      triggerEquals: { rolloutRegressionActive: true, repairWindow1Elapsed: false },
      controlEquals: { [MIGRATION_REPAIR_KEY]: "repairing", [GLOBAL_ROLLBACK_KEY]: true },
    },
    incidentState: "repair-just-started",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 62,
      usCorrectnessRate: 90,
      apacCorrectnessRate: 92,
      alreadyIncompatibleWriteCount: 180,
      repairedRecordCount: 0,
      unreadableReadCount: 50,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "rolled-back",
    },
    componentHealth: repairingHealth,
  },
  {
    id: "repair-window2-growth-stopped",
    when: {
      triggerEquals: {
        rolloutRegressionActive: true,
        repairWindow2Elapsed: true,
        repairFullyDone: false,
      },
      controlEquals: { [MIGRATION_REPAIR_KEY]: "repairing", [REGION_ROLLOUT_EU_KEY]: "halted" },
    },
    incidentState: "repairing-window2",
    values: {
      requestSuccessRate: 99.6,
      euCorrectnessRate: 92,
      usCorrectnessRate: 97,
      apacCorrectnessRate: 98,
      alreadyIncompatibleWriteCount: 220,
      repairedRecordCount: 165,
      unreadableReadCount: 18,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "regionally-halted",
    },
    componentHealth: repairingHealth,
  },
  {
    id: "repair-window1-growth-stopped",
    when: {
      triggerEquals: {
        rolloutRegressionActive: true,
        repairWindow1Elapsed: true,
        repairWindow2Elapsed: false,
      },
      controlEquals: { [MIGRATION_REPAIR_KEY]: "repairing", [REGION_ROLLOUT_EU_KEY]: "halted" },
    },
    incidentState: "repairing-window1",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 80,
      usCorrectnessRate: 94,
      apacCorrectnessRate: 96,
      alreadyIncompatibleWriteCount: 220,
      repairedRecordCount: 70,
      unreadableReadCount: 42,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "regionally-halted",
    },
    componentHealth: repairingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // CONTAINED, GENUINELY SAFE DEGRADED STATE — dual-write engaged
  // fleet-wide. New writes stop creating NEW incompatibility (both
  // representations populated going forward) but the PRE-EXISTING
  // backlog from before dual-write was engaged is untouched —
  // deliberate, bounded, observable tradeoff while the candidate decides
  // whether to also run repair. This is the forward-fix/staged-
  // continuation path named in the spec, implemented as ACCEPTABLE
  // (not optimal) — see definition.ts's completion-mode audit.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "dual-write-contained",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [WRITE_COMPATIBILITY_MODE_KEY]: "dual-write",
        [MIGRATION_REPAIR_KEY]: "idle",
        [GLOBAL_ROLLBACK_KEY]: false,
      },
    },
    incidentState: "dual-write-contained",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 90,
      usCorrectnessRate: 95,
      apacCorrectnessRate: 96,
      alreadyIncompatibleWriteCount: 150,
      repairedRecordCount: 0,
      unreadableReadCount: 25,
      storeCompatibilityStatus: "contained",
      rolloutStatus: "active-dual-write",
    },
    componentHealth: repairingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING — regions halted independently, one at a time. Proves a
  // single region can be halted without touching the others, and that
  // halting alone (no repair, no rollback) still leaves the other
  // active regions growing the backlog.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "eu-halted-only-others-active",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [REGION_ROLLOUT_EU_KEY]: "halted",
        [REGION_ROLLOUT_US_KEY]: "rolled-out",
        [REGION_ROLLOUT_APAC_KEY]: "rolled-out",
        [MIGRATION_REPAIR_KEY]: "idle",
        [GLOBAL_ROLLBACK_KEY]: false,
      },
    },
    incidentState: "eu-halted-only",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 100,
      usCorrectnessRate: 80,
      apacCorrectnessRate: 85,
      alreadyIncompatibleWriteCount: 210,
      repairedRecordCount: 0,
      unreadableReadCount: 70,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: divergingHealth,
  },

  // ── US halted independently of EU/APAC: proves the per-region halt
  // controls are genuinely independent of each other (US and APAC stay
  // at their own initial values while US alone is halted), and that
  // halting the region that is NOT the worst-hit one still only
  // protects that one region's correctness — EU and APAC continue
  // degrading on their own.
  {
    id: "us-halted-only-others-active",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: {
        [REGION_ROLLOUT_US_KEY]: "halted",
        [REGION_ROLLOUT_EU_KEY]: "rolled-out",
        [REGION_ROLLOUT_APAC_KEY]: "rolled-out",
        [MIGRATION_REPAIR_KEY]: "idle",
        [GLOBAL_ROLLBACK_KEY]: false,
      },
    },
    incidentState: "us-halted-only",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 55,
      usCorrectnessRate: 100,
      apacCorrectnessRate: 88,
      alreadyIncompatibleWriteCount: 200,
      repairedRecordCount: 0,
      unreadableReadCount: 65,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: divergingHealth,
  },

  // ── Global rollout paused: stops further exposure GROWTH globally,
  // but every already-rolled-out region keeps writing new-only for its
  // existing traffic — pausing is not a halt and not a fix by itself.
  {
    id: "rollout-paused-still-writing",
    when: {
      triggerEquals: { rolloutRegressionActive: true },
      controlEquals: { [ROLLOUT_PAUSE_KEY]: true, [GLOBAL_ROLLBACK_KEY]: false, [MIGRATION_REPAIR_KEY]: "idle" },
    },
    incidentState: "paused-still-writing",
    values: {
      requestSuccessRate: 99.5,
      euCorrectnessRate: 58,
      usCorrectnessRate: 88,
      apacCorrectnessRate: 90,
      alreadyIncompatibleWriteCount: 230,
      repairedRecordCount: 0,
      unreadableReadCount: 80,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: divergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // CATASTROPHIC ESCALATION — completely unaddressed for a long
  // sustained period. Pushes alreadyIncompatibleWriteCount past the
  // scenario's failureCondition threshold (1,500), proving a true
  // zero-action attempt genuinely fails eventually rather than
  // plateauing forever at sustained-widening's already-bad level.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "catastrophic-widening",
    when: { triggerEquals: { rolloutRegressionActive: true, catastrophicWidening: true } },
    incidentState: "catastrophic-widening",
    values: {
      requestSuccessRate: 99.0,
      euCorrectnessRate: 10,
      usCorrectnessRate: 30,
      apacCorrectnessRate: 35,
      alreadyIncompatibleWriteCount: 1_650,
      repairedRecordCount: 0,
      unreadableReadCount: 1_200,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: wideningHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SUSTAINED ESCALATION — no region halted/paused/rolled back long
  // enough for exposure to widen materially (strictly worse than
  // baseline at the same elapsed time, proving sustainedRollout is a
  // real escalation, not cosmetic).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "sustained-widening",
    when: { triggerEquals: { rolloutRegressionActive: true, sustainedRollout: true } },
    incidentState: "sustained-widening",
    values: {
      requestSuccessRate: 99.3,
      euCorrectnessRate: 35,
      usCorrectnessRate: 60,
      apacCorrectnessRate: 65,
      alreadyIncompatibleWriteCount: 980,
      repairedRecordCount: 0,
      unreadableReadCount: 540,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: wideningHealth,
  },

  // ── Baseline — regression active, no meaningful action taken yet.
  {
    id: "baseline-diverging",
    when: { triggerEquals: { rolloutRegressionActive: true } },
    incidentState: "baseline-diverging",
    values: {
      requestSuccessRate: 99.4,
      euCorrectnessRate: 62,
      usCorrectnessRate: 90,
      apacCorrectnessRate: 92,
      alreadyIncompatibleWriteCount: 120,
      repairedRecordCount: 0,
      unreadableReadCount: 45,
      storeCompatibilityStatus: "diverging",
      rolloutStatus: "active",
    },
    componentHealth: divergingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99.6,
      euCorrectnessRate: 100,
      usCorrectnessRate: 100,
      apacCorrectnessRate: 100,
      alreadyIncompatibleWriteCount: 0,
      repairedRecordCount: 0,
      unreadableReadCount: 0,
      storeCompatibilityStatus: "incident-free",
      rolloutStatus: "active",
    },
    componentHealth: healthyHealth,
  },
];
