import {
  classifyAction,
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { schemaMigrationUnderLiveTraffic } from "./schema-migration-under-live-traffic";
import {
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
  schemaMigrationUnderLiveTrafficSimulation,
} from "./schema-migration-under-live-traffic/definition";
import { schemaMigrationUnderLiveTrafficCandidateUI } from "./schema-migration-under-live-traffic/candidate-ui";
import { SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING } from "./schema-migration-under-live-traffic/scoring";
import { actionClassifications } from "./schema-migration-under-live-traffic/action-classifications";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(schemaMigrationUnderLiveTrafficSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += schemaMigrationUnderLiveTrafficSimulation.tickMs
  ) {
    let action: CandidateAction | null = null;

    if (actionIndex < actions.length && actions[actionIndex]!.atMs <= timeMs) {
      const pending = actions[actionIndex]!;
      actionCounter += 1;
      action = {
        id: `action-${actionCounter}`,
        timestampMs: timeMs,
        controlKey: pending.controlKey,
        value: pending.value,
      };
      actionIndex += 1;
    }

    const result = simulate(
      schemaMigrationUnderLiveTrafficSimulation,
      state,
      action,
      schemaMigrationUnderLiveTrafficSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const COMPATIBILITY_BROKEN_ACTIVE_MS = 20_000;
const BACKFILL_PARTIALLY_DRAINED_MS = COMPATIBILITY_BROKEN_ACTIVE_MS + 90_000;
const COMPATIBILITY_ESCALATES_MS = COMPATIBILITY_BROKEN_ACTIVE_MS + 3 * 60_000;
const BACKFILL_WINDOW_ELAPSED_MS = COMPATIBILITY_BROKEN_ACTIVE_MS + 5 * 60_000;

// Correct sequencing: stop creating incompatible rows first, THEN run
// backfill, THEN (once the window elapses) declare a direction.
const SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS: TimedAction[] = [
  { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
  { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
  { atMs: BACKFILL_WINDOW_ELAPSED_MS + 1_000, controlKey: ROLLBACK_APP_FLEET_KEY, value: true },
];

const SAFE_DUAL_SHAPE_AND_BACKFILL_FORWARD_ACTIONS: TimedAction[] = [
  { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
  { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
  { atMs: BACKFILL_WINDOW_ELAPSED_MS + 1_000, controlKey: APP_ROLLOUT_PERCENT_KEY, value: 100 },
  { atMs: BACKFILL_WINDOW_ELAPSED_MS + 2_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "new-shape-only" },
  { atMs: BACKFILL_WINDOW_ELAPSED_MS + 3_000, controlKey: MIGRATION_PHASE_KEY, value: "contract" },
];

// The named unsafe sequence: roll back immediately while compatibility
// write mode is still legacy-shape (new-shape-only rows already exist).
const UNSAFE_ROLLBACK_BEFORE_REPAIR_ACTIONS: TimedAction[] = [
  { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: ROLLBACK_APP_FLEET_KEY, value: true },
];

describe("Schema Migration Under Live Traffic", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(schemaMigrationUnderLiveTraffic.isFree).toBe(false);
      expect(schemaMigrationUnderLiveTraffic.library?.category).toBe("Databases & Storage");
      expect(schemaMigrationUnderLiveTraffic.library?.tags.length).toBeGreaterThan(0);
      expect(schemaMigrationUnderLiveTraffic.library?.skills.length).toBeGreaterThan(0);
      expect(schemaMigrationUnderLiveTraffic.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        [
          "recovery",
          "customerImpact",
          "dataIntegrity",
          "reliability",
          "costEfficiency",
          "operationalEfficiency",
        ].sort(),
      );
      const totalMax = SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(schemaMigrationUnderLiveTrafficCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(schemaMigrationUnderLiveTrafficCandidateUI.controls.length).toBe(7);
      expect(schemaMigrationUnderLiveTrafficCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 flat nodes and 6 edges matching the spec", () => {
      expect(schemaMigrationUnderLiveTrafficSimulation.architecture.nodes.length).toBe(6);
      expect(schemaMigrationUnderLiveTrafficSimulation.architecture.edges.length).toBe(6);
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(schemaMigrationUnderLiveTraffic.description).toMatch(/remain readable by the currently-serving application fleet/i);
      expect(schemaMigrationUnderLiveTraffic.description).toMatch(/acknowledged writes may not be discarded to make rollback easier/i);
      expect(schemaMigrationUnderLiveTraffic.description).toMatch(/schema rollout may be paused or slowed/i);
      expect(schemaMigrationUnderLiveTraffic.description).toMatch(/backfill completion is less important than customer correctness/i);
      expect(schemaMigrationUnderLiveTraffic.description).toMatch(/must not leave the database in a state that only one app version can interpret/i);
    });

    it("declares candidate_declared completion with an authored acceptable condition", () => {
      expect(schemaMigrationUnderLiveTrafficSimulation.completion?.mode).toBe("candidate_declared");
      expect(schemaMigrationUnderLiveTrafficSimulation.completion?.acceptableCondition).toBeDefined();
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(schemaMigrationUnderLiveTrafficSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.newShapeOnlyRowCount).toBe(0);
      expect(state.values.compatibilityStatus).toBe("safe");
    });

    it("compatibility breaks and begins accumulating with no action taken", () => {
      const state = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 5_000);
      expect(state.incidentStartedAtMs).toBe(COMPATIBILITY_BROKEN_ACTIVE_MS);
      expect(state.values.newShapeOnlyRowCount).toBeGreaterThan(0);
      expect(state.values.requestSuccessRate).toBeGreaterThanOrEqual(95);
    });

    it("baseline (no action) keeps availability high while the row-shape backlog grows -- a correctness problem hiding behind a healthy dashboard", () => {
      const state = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);
      expect(state.transitions.incidentState).toBe("compatibility-broken-baseline");
      expect(state.values.requestSuccessRate).toBeGreaterThanOrEqual(95);
      expect(state.values.newShapeOnlyRowCount).toBeGreaterThan(0);
      expect(state.values.compatibilityStatus).toBe("unresolved");
    });

    it("left unaddressed through escalation, the backlog grows further still", () => {
      const early = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);
      const late = runScenario(COMPATIBILITY_ESCALATES_MS + 20_000);
      expect(late.values.newShapeOnlyRowCount as number).toBeGreaterThan(
        early.values.newShapeOnlyRowCount as number,
      );
    });

    describe("Required pressure-transfer mechanism #1: aggressive rollout while compatibility is broken", () => {
      it("harmful/tempting path: continuing rollout while broken accelerates the backlog versus leaving rollout unchanged", () => {
        const before = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);

        const rolledOutState = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: APP_ROLLOUT_PERCENT_KEY, value: 75 },
        ]);

        expect(rolledOutState.transitions.incidentState).toBe("aggressive-rollout-continues-while-broken");
        expect(rolledOutState.values.newShapeOnlyRowCount as number).toBeGreaterThan(
          before.values.newShapeOnlyRowCount as number,
        );

        const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, rolledOutState);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Required pressure-transfer mechanism #2: more backfill workers -> DB lock/write pressure", () => {
      it("high backfill concurrency drains the backlog faster but raises DB lock wait for live traffic", () => {
        const lowConcurrency = runScenario(BACKFILL_PARTIALLY_DRAINED_MS + 1_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
        ]);
        const highConcurrency = runScenario(BACKFILL_PARTIALLY_DRAINED_MS + 1_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        ]);

        // High concurrency repairs more rows (real, distinct progress)...
        expect(highConcurrency.values.backfillRepairedRowCount as number).toBeGreaterThan(
          lowConcurrency.values.backfillRepairedRowCount as number,
        );
        // ...but measurably raises DB lock wait for live traffic -- the
        // real, authored pressure-transfer cost.
        expect(highConcurrency.values.dbLockWaitMs as number).toBeGreaterThan(
          lowConcurrency.values.dbLockWaitMs as number,
        );
      });

      it("high concurrency + normal (short) lock timeout turns the pressure transfer into outright write failures", () => {
        const highExtended = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 30_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 3_000, controlKey: DB_LOCK_TIMEOUT_MODE_KEY, value: "extended" },
        ]);
        const highNormal = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 30_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        ]);

        // Extended timeout absorbs pressure as latency, not failures.
        expect(highExtended.values.lockTimeoutFailureCount).toBe(0);
        // Normal (short) timeout under the same backfill pressure
        // produces real, counted write failures instead.
        expect(highNormal.values.lockTimeoutFailureCount as number).toBeGreaterThan(0);
      });

      it("aggressive retry policy compounds lock contention further on top of high-concurrency backfill", () => {
        const normalRetry = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 30_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        ]);
        const aggressiveRetry = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 30_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 3_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
        ]);

        expect(aggressiveRetry.values.dbLockWaitMs as number).toBeGreaterThan(
          normalRetry.values.dbLockWaitMs as number,
        );
        expect(aggressiveRetry.values.lockTimeoutFailureCount as number).toBeGreaterThan(
          normalRetry.values.lockTimeoutFailureCount as number,
        );
      });

      it("enabling extended lock timeout with no backfill running does nothing -- there is no contention to relieve", () => {
        const baseline = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 10_000);
        const extendedAlone = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 10_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: DB_LOCK_TIMEOUT_MODE_KEY, value: "extended" },
        ]);
        expect(extendedAlone.values.dbLockWaitMs).toBe(baseline.values.dbLockWaitMs);
        expect(extendedAlone.transitions.incidentState).toBe("compatibility-broken-baseline");
      });
    });

    describe("Historical damage model: dual-shape stops growth but never resets the backlog", () => {
      it("switching to dual-shape stops further row-shape growth but the existing backlog remains exactly where it was", () => {
        const stillBroken = runScenario(COMPATIBILITY_ESCALATES_MS + 10_000);
        const frozenRightAfter = runScenario(COMPATIBILITY_ESCALATES_MS + 10_000, [
          { atMs: COMPATIBILITY_ESCALATES_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
        ]);
        const frozenMuchLater = runScenario(COMPATIBILITY_ESCALATES_MS + 60_000, [
          { atMs: COMPATIBILITY_ESCALATES_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
        ]);

        expect(frozenRightAfter.values.newShapeOnlyRowCount as number).toBeGreaterThan(0);
        // Critically: it does NOT silently drain to zero over time on
        // its own, merely because the write mode changed and no
        // backfill process is running.
        expect(frozenMuchLater.values.newShapeOnlyRowCount).toBe(
          frozenRightAfter.values.newShapeOnlyRowCount,
        );
        expect(frozenMuchLater.values.compatibilityStatus).toBe("contained");

        const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, frozenMuchLater);
        expect(eligibility).toEqual({ eligible: false });
        expect(stillBroken.values.newShapeOnlyRowCount).toBeGreaterThan(0);
      });

      it("only active backfill drains the backlog, and only over real elapsed time", () => {
        const rightAfterStartingBackfill = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 10_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
        ]);
        const fullyRepaired = runScenario(
          BACKFILL_WINDOW_ELAPSED_MS + 5_000,
          SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS.slice(0, 2),
        );

        expect(rightAfterStartingBackfill.values.newShapeOnlyRowCount as number).toBeGreaterThan(0);
        expect(fullyRepaired.values.newShapeOnlyRowCount).toBe(0);
        expect(fullyRepaired.values.compatibilityStatus).toBe("safe");
      });
    });

    describe("Tempting but harmful: contracting before backfill repairs the backlog", () => {
      it("contracting early discards acknowledged data even though it looks like migration progress", () => {
        const baseline = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);
        const earlyContract = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: MIGRATION_PHASE_KEY, value: "contract" },
        ]);

        expect(earlyContract.values.discardedAcknowledgedWriteCount).toBeGreaterThan(0);
        expect(earlyContract.values.compatibilityStatus).toBe("violated");
        expect(baseline.values.discardedAcknowledgedWriteCount).toBe(0);

        const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, earlyContract);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("MIGRATION QA (phase6d3.md section 23): same final control state, different history, different safety", () => {
      it("unsafe order: roll back immediately while legacy-shape rows already exist -> real, counted unreadable reads", () => {
        const state = runScenario(
          COMPATIBILITY_BROKEN_ACTIVE_MS + 10_000,
          UNSAFE_ROLLBACK_BEFORE_REPAIR_ACTIONS,
        );

        expect(state.transitions.incidentState).toMatch(/^unsafe-sequence-rollback-before-repair/);
        // Looks maximally available...
        expect(state.values.requestSuccessRate).toBeGreaterThanOrEqual(95);
        // ...while real acknowledged data is now unreadable by the
        // serving fleet.
        expect(state.values.unreadableByServingFleetCount).toBeGreaterThan(0);
        expect(state.values.compatibilityStatus).toBe("violated");

        const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("safe order: repair the backlog to zero BEFORE rolling back -- same final controls (rollbackAppFleet=true, dual-shape), no data loss at all", () => {
        const state = runScenario(
          BACKFILL_WINDOW_ELAPSED_MS + 40_000,
          SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS,
        );

        // Same final control tuple as the unsafe case would eventually
        // reach if dual-shape were applied afterward: rollbackAppFleet
        // = true, compatibilityWriteMode = dual-shape.
        expect(state.controlValues[ROLLBACK_APP_FLEET_KEY]).toBe(true);
        expect(state.controlValues[COMPATIBILITY_WRITE_MODE_KEY]).toBe("dual-shape");

        expect(state.values.newShapeOnlyRowCount).toBe(0);
        expect(state.values.unreadableByServingFleetCount).toBe(0);
        expect(state.values.compatibilityStatus).toBe("safe");

        const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      });

      it("the same unsafe control combination applied earlier (before escalation) still produces a real, nonzero violation -- the mechanism is about order, not just magnitude", () => {
        const state = runScenario(
          COMPATIBILITY_BROKEN_ACTIVE_MS + 5_000,
          UNSAFE_ROLLBACK_BEFORE_REPAIR_ACTIONS,
        );
        expect(state.values.unreadableByServingFleetCount).toBeGreaterThan(0);
        expect(state.transitions.incidentState).toBe("unsafe-sequence-rollback-before-repair-early");
      });
    });

    describe("Recovery lag: backfill relieves pressure but does not clear instantly", () => {
      it("immediately after starting backfill, the backlog is lower than frozen-with-no-backfill, but not yet bounded to the acceptable threshold", () => {
        const frozenOnly = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 30_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
        ]);
        const draining = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 30_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
        ]);
        expect(draining.transitions.incidentState).toBe("draining-early-low-concurrency");
        expect(draining.values.newShapeOnlyRowCount).toBeGreaterThan(0);
        expect(draining.values.newShapeOnlyRowCount as number).toBeLessThan(
          frozenOnly.values.newShapeOnlyRowCount as number,
        );
        expect(draining.values.newShapeOnlyRowCount as number).toBeGreaterThan(100);
      });

      it("only once the partial-drain recovery-lag checkpoint has elapsed does the backlog cross into the acceptable-bounded range", () => {
        const partiallyDrained = runScenario(BACKFILL_PARTIALLY_DRAINED_MS + 40_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
        ]);
        expect(partiallyDrained.transitions.incidentState).toBe("draining-bounded-low-concurrency");
        expect(partiallyDrained.values.newShapeOnlyRowCount).toBeLessThanOrEqual(100);
        expect(partiallyDrained.values.newShapeOnlyRowCount).toBeGreaterThan(0);
      });

      it("only after the real elapsed backfill window does the fully-repaired state appear", () => {
        const repaired = runScenario(BACKFILL_WINDOW_ELAPSED_MS + 5_000, [
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
          { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "low" },
        ]);
        expect(repaired.values.newShapeOnlyRowCount).toBe(0);
        expect(repaired.values.compatibilityStatus).toBe("safe");
      });
    });

    describe("Immediate-Finish audit", () => {
      it("zero candidate actions, Finish immediately -> declared_unstable (expected default)", () => {
        const state = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(schemaMigrationUnderLiveTrafficSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });

      it("Finish immediately at T=0, before the incident has even started -> declared_unstable", () => {
        const state = createInitialState(schemaMigrationUnderLiveTrafficSimulation);
        const result = evaluateCandidateDeclaredFinish(schemaMigrationUnderLiveTrafficSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });
    });
  });

  describe("Multi-step / alternate strong paths", () => {
    it("alternate strong path A: dual-shape + backfill + roll back cleanly -- reaches OPTIMAL", () => {
      const state = runScenario(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS,
      );
      const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      expect(state.values.compatibilityStatus).toBe("safe");
      expect(state.values.servingFleetMode).toBe("old-only");
    });

    it("alternate strong path B: dual-shape + backfill + complete rollout forward -- also reaches OPTIMAL", () => {
      const state = runScenario(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_FORWARD_ACTIONS,
      );
      const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      expect(state.values.compatibilityStatus).toBe("safe");
      expect(state.values.servingFleetMode).toBe("new-only");
    });

    it("a bounded, draining-but-not-fully-repaired state is ACCEPTABLE, distinct from OPTIMAL", () => {
      const draining = runScenario(BACKFILL_PARTIALLY_DRAINED_MS + 40_000, [
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 3_000, controlKey: DB_LOCK_TIMEOUT_MODE_KEY, value: "extended" },
      ]);
      const eligibility = evaluateCompletionEligibility(schemaMigrationUnderLiveTrafficSimulation, draining);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(draining.values.newShapeOnlyRowCount as number).toBeGreaterThan(0);
    });
  });

  describe("Action classification coverage", () => {
    it("every control has at least one classified action", () => {
      const classifiedKeys = new Set(actionClassifications.map((rule) => rule.controlKey));
      expect(classifiedKeys.has(APP_ROLLOUT_PERCENT_KEY)).toBe(true);
      expect(classifiedKeys.has(COMPATIBILITY_WRITE_MODE_KEY)).toBe(true);
      expect(classifiedKeys.has(MIGRATION_PHASE_KEY)).toBe(true);
      expect(classifiedKeys.has(BACKFILL_CONCURRENCY_KEY)).toBe(true);
      expect(classifiedKeys.has(DB_LOCK_TIMEOUT_MODE_KEY)).toBe(true);
      expect(classifiedKeys.has(ROLLBACK_APP_FLEET_KEY)).toBe(true);
      expect(classifiedKeys.has(RETRY_POLICY_KEY)).toBe(true);
    });

    it("every classification rule with a meaningful consequence carries authored feedback", () => {
      for (const rule of actionClassifications) {
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("switching to dual-shape is classified beneficial with real feedback", () => {
      const result = classifyAction(
        actionClassifications,
        COMPATIBILITY_WRITE_MODE_KEY,
        "dual-shape",
        { compatibilityBrokenActive: true },
      );
      expect(result.outcome).toBe("beneficial");
      expect(result.matchedRuleId).toBe("acr_1");
    });
  });

  describe("Scoring", () => {
    function scoreRun(untilMs: number, actions: TimedAction[] = []) {
      const state = runScenario(untilMs, actions);
      const result = evaluateCandidateDeclaredFinish(schemaMigrationUnderLiveTrafficSimulation, state);
      const inputs = extractFinishScoringInputs(schemaMigrationUnderLiveTrafficSimulation, result);
      return { state, result, score: scoreAuthoredAttempt(SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING, inputs) };
    }

    it("optimal path (dual-shape + backfill + clean rollback) scores at or near the top", () => {
      const { result, score } = scoreRun(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS,
      );
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThanOrEqual(700);
    });

    it("alternate strong path (forward completion) also scores at or near the top on dataIntegrity/reliability", () => {
      const { result, score } = scoreRun(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_FORWARD_ACTIONS,
      );
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
    });

    it("acceptable path (dual-shape + bounded draining, not yet fully repaired) scores full dataIntegrity but NOT full reliability", () => {
      const { result, score } = scoreRun(BACKFILL_PARTIALLY_DRAINED_MS + 40_000, [
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 3_000, controlKey: DB_LOCK_TIMEOUT_MODE_KEY, value: "extended" },
      ]);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(60);
    });

    it("baseline (no action) never resolves -- scores poorly", () => {
      const state = runScenario(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(schemaMigrationUnderLiveTrafficSimulation, state);
      expect(result.outcome).toBe("declared_unstable");

      const inputs = extractFinishScoringInputs(schemaMigrationUnderLiveTrafficSimulation, result);
      const score = scoreAuthoredAttempt(SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      expect(score.total).toBeLessThan(400);
    });

    it("harmful path (early contract) scores materially worse on dataIntegrity despite a lower raw row count than escalated baseline", () => {
      const { score: contractScore } = scoreRun(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000, [
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: MIGRATION_PHASE_KEY, value: "contract" },
      ]);
      const { score: baselineScore } = scoreRun(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);

      expect(contractScore.breakdown.dataIntegrity).toBe(30);
      expect(contractScore.breakdown.dataIntegrity).toBeLessThanOrEqual(
        baselineScore.breakdown.dataIntegrity,
      );
    });

    it("harmful path (early contract) scores worse total than doing nothing -- harmful must be worse than baseline", () => {
      const { score: contractScore } = scoreRun(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000, [
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: MIGRATION_PHASE_KEY, value: "contract" },
      ]);
      const { score: baselineScore } = scoreRun(COMPATIBILITY_BROKEN_ACTIVE_MS + 20_000);

      expect(contractScore.total).toBeLessThan(baselineScore.total);
    });

    it("harmful unsafe-sequence path (rollback before repair) scores materially worse on dataIntegrity despite excellent availability", () => {
      const { score } = scoreRun(
        COMPATIBILITY_BROKEN_ACTIVE_MS + 10_000,
        UNSAFE_ROLLBACK_BEFORE_REPAIR_ACTIONS,
      );
      expect(score.breakdown.dataIntegrity).toBe(30);
    });

    it("sanity check: acceptable tier never outscores optimal for the same scenario", () => {
      const { score: acceptableScore } = scoreRun(BACKFILL_PARTIALLY_DRAINED_MS + 40_000, [
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 1_000, controlKey: COMPATIBILITY_WRITE_MODE_KEY, value: "dual-shape" },
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 2_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        { atMs: COMPATIBILITY_BROKEN_ACTIVE_MS + 3_000, controlKey: DB_LOCK_TIMEOUT_MODE_KEY, value: "extended" },
      ]);
      const { score: optimalScore } = scoreRun(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS,
      );
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
    });
  });

  describe("Determinism", () => {
    it("running the exact same action sequence twice produces identical final state and score", () => {
      const run1 = runScenario(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS,
      );
      const run2 = runScenario(
        BACKFILL_WINDOW_ELAPSED_MS + 40_000,
        SAFE_DUAL_SHAPE_AND_BACKFILL_ROLLBACK_ACTIONS,
      );
      expect(run1.values).toEqual(run2.values);
      expect(run1.transitions.incidentState).toEqual(run2.transitions.incidentState);
    });
  });
});
