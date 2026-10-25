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
import { apiMigrationDualWriteFailure } from "./api-migration-dual-write-failure";
import {
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
  apiMigrationDualWriteFailureSimulation,
} from "./api-migration-dual-write-failure/definition";
import { apiMigrationDualWriteFailureCandidateUI } from "./api-migration-dual-write-failure/candidate-ui";
import { API_MIGRATION_DUAL_WRITE_FAILURE_SCORING } from "./api-migration-dual-write-failure/scoring";
import { actionClassifications } from "./api-migration-dual-write-failure/action-classifications";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(apiMigrationDualWriteFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += apiMigrationDualWriteFailureSimulation.tickMs
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
      apiMigrationDualWriteFailureSimulation,
      state,
      action,
      apiMigrationDualWriteFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const DUAL_WRITE_DIVERGENCE_ACTIVE_MS = 20_000;
const RECONCILIATION_PARTIALLY_DRAINED_MS = DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 90_000;
const DIVERGENCE_ESCALATES_MS = DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3 * 60_000;
const RECONCILIATION_WINDOW_ELAPSED_MS = DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 5 * 60_000;

// Correct sequencing: freeze write authority first, THEN run
// diff-and-repair reconciliation, THEN (once the window elapses)
// declare a strategic direction.
const SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS: TimedAction[] = [
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: READ_SOURCE_KEY, value: "legacy" },
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
  { atMs: RECONCILIATION_WINDOW_ELAPSED_MS + 1_000, controlKey: MIGRATION_DIRECTION_KEY, value: "rollback-legacy" },
];

const SAFE_FREEZE_AND_RECONCILE_NEW_ACTIONS: TimedAction[] = [
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: READ_SOURCE_KEY, value: "new" },
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 4_000, controlKey: ROLLOUT_PERCENT_KEY, value: 100 },
  { atMs: RECONCILIATION_WINDOW_ELAPSED_MS + 1_000, controlKey: MIGRATION_DIRECTION_KEY, value: "continue-new" },
];

// The named unsafe sequence: rollback application traffic -> leave
// new-only writes unreconciled -> switch reads to legacy.
const UNSAFE_ROLLBACK_BEFORE_RECONCILE_ACTIONS: TimedAction[] = [
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: ROLLBACK_APPLICATION_TRAFFIC_KEY, value: true },
  { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: READ_SOURCE_KEY, value: "legacy" },
];

describe("API Migration Dual-Write Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(apiMigrationDualWriteFailure.isFree).toBe(false);
      expect(apiMigrationDualWriteFailure.library?.category).toBe("Distributed Systems");
      expect(apiMigrationDualWriteFailure.library?.tags.length).toBeGreaterThan(0);
      expect(apiMigrationDualWriteFailure.library?.skills.length).toBeGreaterThan(0);
      expect(apiMigrationDualWriteFailure.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = API_MIGRATION_DUAL_WRITE_FAILURE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = API_MIGRATION_DUAL_WRITE_FAILURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(apiMigrationDualWriteFailureCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(apiMigrationDualWriteFailureCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(apiMigrationDualWriteFailureCandidateUI.components.length).toBe(8);
    });

    it("the architecture has exactly 8 flat nodes and 8 edges matching the spec", () => {
      expect(apiMigrationDualWriteFailureSimulation.architecture.nodes.length).toBe(8);
      expect(apiMigrationDualWriteFailureSimulation.architecture.edges.length).toBe(8);
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(apiMigrationDualWriteFailure.description).toMatch(/exactly one authoritative write source/i);
      expect(apiMigrationDualWriteFailure.description).toMatch(/acknowledged writes must not disappear during rollback/i);
      expect(apiMigrationDualWriteFailure.description).toMatch(/rollback does not automatically repair data/i);
      expect(apiMigrationDualWriteFailure.description).toMatch(/read routing must not expose unresolved divergent state/i);
      expect(apiMigrationDualWriteFailure.description).toMatch(/migration safety outranks rollout velocity/i);
    });

    it("declares candidate_declared completion with an authored acceptable condition", () => {
      expect(apiMigrationDualWriteFailureSimulation.completion?.mode).toBe("candidate_declared");
      expect(apiMigrationDualWriteFailureSimulation.completion?.acceptableCondition).toBeDefined();
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(apiMigrationDualWriteFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.unreconciledDivergentRecordCount).toBe(0);
      expect(state.values.correctnessStatus).toBe("safe");
    });

    it("dual-write divergence activates and begins accumulating with no action taken", () => {
      const state = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 5_000);
      expect(state.incidentStartedAtMs).toBe(DUAL_WRITE_DIVERGENCE_ACTIVE_MS);
      expect(state.values.unreconciledDivergentRecordCount).toBeGreaterThan(0);
      expect(state.values.requestSuccessRate).toBeGreaterThanOrEqual(95);
    });

    it("baseline (no action) keeps availability high while divergence grows -- a correctness problem hiding behind a healthy dashboard", () => {
      const state = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);
      expect(state.transitions.incidentState).toBe("dual-write-unmitigated-baseline");
      expect(state.values.requestSuccessRate).toBeGreaterThanOrEqual(95);
      expect(state.values.unreconciledDivergentRecordCount).toBeGreaterThan(0);
      expect(state.values.correctnessStatus).toBe("unresolved");
    });

    it("left unaddressed through escalation, divergence grows further still", () => {
      const early = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);
      const late = runScenario(DIVERGENCE_ESCALATES_MS + 20_000);
      expect(late.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(
        early.values.unreconciledDivergentRecordCount as number,
      );
    });

    describe("Required pressure-transfer mechanism: aggressive rollout increase while still dual-writing", () => {
      it("harmful/tempting path: raising rollout while dual-writing accelerates divergence versus leaving rollout unchanged", () => {
        const before = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);

        const rolledOutState = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: ROLLOUT_PERCENT_KEY, value: 75 },
        ]);

        expect(rolledOutState.transitions.incidentState).toBe(
          "aggressive-rollout-increase-accelerates-divergence",
        );
        expect(rolledOutState.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(
          before.values.unreconciledDivergentRecordCount as number,
        );

        // Not yet a hard correctness violation (no exposed/lost
        // writes) -- this is unbounded accumulation, not an exposure
        // event -- but still genuinely unsafe to hand back.
        const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, rolledOutState);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("shadow traffic warm-up gives a real, distinct, measurable mitigation when rollout is later raised while still dual-writing -- but never makes it safe or free", () => {
        const coldRolloutIncrease = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: ROLLOUT_PERCENT_KEY, value: 75 },
        ]);
        const warmedUpRolloutIncrease = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 500, controlKey: SHADOW_TRAFFIC_KEY, value: true },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: ROLLOUT_PERCENT_KEY, value: 75 },
        ]);
        const baseline = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);
        const shadowTrafficAloneNoRolloutChange = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 500, controlKey: SHADOW_TRAFFIC_KEY, value: true },
        ]);

        expect(warmedUpRolloutIncrease.transitions.incidentState).toBe(
          "aggressive-rollout-increase-with-shadow-warmup",
        );
        expect(coldRolloutIncrease.transitions.incidentState).toBe(
          "aggressive-rollout-increase-accelerates-divergence",
        );

        // Real, distinct, measurable mitigation: warmed-up rollout
        // increase accumulates LESS divergence than the cold rollout
        // increase, at the exact same trigger window.
        expect(warmedUpRolloutIncrease.values.unreconciledDivergentRecordCount as number).toBeLessThan(
          coldRolloutIncrease.values.unreconciledDivergentRecordCount as number,
        );
        expect(warmedUpRolloutIncrease.values.newOnlyUnreconciledRecordCount as number).toBeLessThan(
          coldRolloutIncrease.values.newOnlyUnreconciledRecordCount as number,
        );

        // But shadow traffic never makes raising rollout while
        // dual-writing actually safe: it still accumulates strictly
        // MORE divergence than leaving rollout unchanged altogether.
        expect(warmedUpRolloutIncrease.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(
          baseline.values.unreconciledDivergentRecordCount as number,
        );
        expect(warmedUpRolloutIncrease.values.correctnessStatus).toBe("unresolved");

        const eligibility = evaluateCompletionEligibility(
          apiMigrationDualWriteFailureSimulation,
          warmedUpRolloutIncrease,
        );
        expect(eligibility).toEqual({ eligible: false });

        // Shadow traffic alone, with no rollout change at all, does
        // nothing to reduce the ambient divergence rate -- it is a
        // pure warm-up signal with no effect on its own.
        expect(shadowTrafficAloneNoRolloutChange.values.unreconciledDivergentRecordCount).toBe(
          baseline.values.unreconciledDivergentRecordCount,
        );
        expect(shadowTrafficAloneNoRolloutChange.transitions.incidentState).toBe(
          "dual-write-unmitigated-baseline",
        );
      });

      it("enabling shadow traffic is classified as a neutral, real action with authored feedback (not a no-op)", () => {
        const result = classifyAction(
          actionClassifications,
          SHADOW_TRAFFIC_KEY,
          true,
          { dualWriteDivergenceActive: true },
        );
        expect(result.outcome).toBe("neutral");
        expect(result.matchedRuleId).toBe("acr_11");

        const rule = actionClassifications.find((r) => r.id === "acr_11");
        expect(rule?.feedback?.title.length).toBeGreaterThan(0);
        expect(rule?.feedback?.explanation).toMatch(/warm-up/i);
        expect(rule?.feedback?.explanation).toMatch(/does not stop or repair any divergence/i);
      });

      it("required pressure-transfer: critical-first repair priority drains the backlog faster but raises New Service write latency, worse still at high rollout", () => {
        const normalPriority = runScenario(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        ]);
        const criticalFirst = runScenario(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: REPAIR_PRIORITY_KEY, value: "critical-first" },
        ]);
        const criticalFirstHighRollout = runScenario(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: REPAIR_PRIORITY_KEY, value: "critical-first" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 4_000, controlKey: ROLLOUT_PERCENT_KEY, value: 75 },
        ]);

        // Critical-first drains the backlog faster (lower queue depth)...
        expect(criticalFirst.values.reconciliationQueueDepth as number).toBeLessThan(
          normalPriority.values.reconciliationQueueDepth as number,
        );
        // ...but measurably raises New Service write latency as the
        // real pressure-transfer cost, worse still once rollout is
        // simultaneously kept high.
        expect(criticalFirst.values.newServiceWriteLatencyMs as number).toBeGreaterThan(
          normalPriority.values.newServiceWriteLatencyMs as number,
        );
        expect(criticalFirstHighRollout.values.newServiceWriteLatencyMs as number).toBeGreaterThan(
          criticalFirst.values.newServiceWriteLatencyMs as number,
        );
      });
    });

    describe("Historical damage model: freezing write authority stops growth but never resets the backlog", () => {
      it("freezing write mode stops further divergence growth but the existing backlog remains exactly where it was", () => {
        const diverging = runScenario(DIVERGENCE_ESCALATES_MS + 10_000);
        const frozenRightAfter = runScenario(DIVERGENCE_ESCALATES_MS + 10_000, [
          { atMs: DIVERGENCE_ESCALATES_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
        ]);
        const frozenMuchLater = runScenario(DIVERGENCE_ESCALATES_MS + 60_000, [
          { atMs: DIVERGENCE_ESCALATES_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
        ]);

        // Freezing does not instantly erase the already-accumulated
        // backlog -- it is nonzero immediately after freezing.
        expect(frozenRightAfter.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(0);

        // And critically: it does NOT silently drain to zero over
        // time on its own, merely because write mode changed and no
        // reconciliation process is running.
        expect(frozenMuchLater.values.unreconciledDivergentRecordCount).toBe(
          frozenRightAfter.values.unreconciledDivergentRecordCount,
        );
        expect(frozenMuchLater.values.correctnessStatus).toBe("contained");

        // A frozen-but-never-reconciled backlog this large must never
        // be eligible for Finish, even as "acceptable".
        const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, frozenMuchLater);
        expect(eligibility).toEqual({ eligible: false });
        expect(diverging.values.unreconciledDivergentRecordCount).toBeGreaterThan(0);
      });

      it("only an actual diff-and-repair reconciliation process drains the backlog, and only over real elapsed time", () => {
        const rightAfterStartingRepair = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 10_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        ]);
        const fullyDrained = runScenario(RECONCILIATION_WINDOW_ELAPSED_MS + 5_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: READ_SOURCE_KEY, value: "legacy" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        ]);

        expect(rightAfterStartingRepair.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(0);
        expect(fullyDrained.values.unreconciledDivergentRecordCount).toBe(0);
        expect(fullyDrained.values.correctnessStatus).toBe("safe");
      });
    });

    describe("Tempting but harmful: blind replay reconciliation corrupts data even as the raw count drops", () => {
      it("replay-blind lowers the divergence count but introduces real, counted data corruption", () => {
        const baseline = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);
        const blindReplay = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: "replay-blind" },
        ]);

        expect(blindReplay.values.unreconciledDivergentRecordCount as number).toBeLessThan(
          baseline.values.unreconciledDivergentRecordCount as number,
        );
        expect(blindReplay.values.blindReplayCorruptionCount).toBeGreaterThan(0);
        expect(blindReplay.values.correctnessStatus).toBe("violated");

        const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, blindReplay);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Sequencing sensitivity: rollback application traffic before reconciling New-only writes", () => {
      it("unsafe order: rollback -> leave new-only writes unreconciled -> switch reads to legacy exposes/loses real acknowledged data", () => {
        const state = runScenario(
          DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 10_000,
          UNSAFE_ROLLBACK_BEFORE_RECONCILE_ACTIONS,
        );

        expect(state.transitions.incidentState).toMatch(/^unsafe-sequence-rollback-before-reconcile/);
        // Looks maximally available...
        expect(state.values.requestSuccessRate).toBeGreaterThanOrEqual(95);
        // ...while real acknowledged data has become unreachable.
        expect(state.values.silentlyLostAcknowledgedWriteCount).toBeGreaterThan(0);
        expect(state.values.exposedDivergentReadCount).toBeGreaterThan(0);
        expect(state.values.correctnessStatus).toBe("violated");

        const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("safe order: reconcile to zero divergence BEFORE rolling back and switching reads -- no data loss at all", () => {
        const state = runScenario(RECONCILIATION_WINDOW_ELAPSED_MS + 5_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
          // Only AFTER the reconciliation window has elapsed (backlog
          // fully drained) do we roll back and switch reads.
          { atMs: RECONCILIATION_WINDOW_ELAPSED_MS + 1_000, controlKey: ROLLBACK_APPLICATION_TRAFFIC_KEY, value: true },
          { atMs: RECONCILIATION_WINDOW_ELAPSED_MS + 2_000, controlKey: READ_SOURCE_KEY, value: "legacy" },
        ]);

        expect(state.values.unreconciledDivergentRecordCount).toBe(0);
        expect(state.values.silentlyLostAcknowledgedWriteCount).toBe(0);
        expect(state.values.exposedDivergentReadCount).toBe(0);
      });

      it("the same unsafe control combination applied earlier (before escalation) still produces a real, nonzero violation -- the mechanism is about order, not just magnitude", () => {
        const state = runScenario(
          DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 5_000,
          UNSAFE_ROLLBACK_BEFORE_RECONCILE_ACTIONS,
        );
        expect(state.values.silentlyLostAcknowledgedWriteCount).toBeGreaterThan(0);
        expect(state.transitions.incidentState).toBe("unsafe-sequence-rollback-before-reconcile-early");
      });
    });

    describe("Recovery lag: reconciliation relieves pressure but does not clear instantly", () => {
      it("immediately after starting diff-and-repair, the backlog is lower than frozen-but-unreconciled, but not yet zero, and not yet bounded to the acceptable threshold", () => {
        const frozenOnly = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 30_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
        ]);
        const draining = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 30_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        ]);
        expect(draining.transitions.incidentState).toBe("draining-early-legacy-authoritative");
        expect(draining.values.unreconciledDivergentRecordCount).toBeGreaterThan(0);
        // Real, distinct progress from reconciliation running, even
        // this early -- lower than the frozen-but-unreconciled ceiling...
        expect(draining.values.unreconciledDivergentRecordCount as number).toBeLessThan(
          frozenOnly.values.unreconciledDivergentRecordCount as number,
        );
        // ...but not yet drained far enough to cross the acceptable
        // bar -- real elapsed reconciliation time has not passed yet.
        expect(draining.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(100);
      });

      it("only once the partial-drain recovery-lag checkpoint has elapsed does the backlog cross into the acceptable-bounded range", () => {
        const partiallyDrained = runScenario(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        ]);
        expect(partiallyDrained.transitions.incidentState).toBe("draining-normal-priority-legacy-authoritative");
        expect(partiallyDrained.values.unreconciledDivergentRecordCount).toBeLessThanOrEqual(100);
        expect(partiallyDrained.values.unreconciledDivergentRecordCount).toBeGreaterThan(0);
      });

      it("only after the real elapsed reconciliation window does the fully-drained state appear", () => {
        const drained = runScenario(RECONCILIATION_WINDOW_ELAPSED_MS + 5_000, [
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "legacy-only" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: READ_SOURCE_KEY, value: "legacy" },
          { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        ]);
        expect(drained.values.unreconciledDivergentRecordCount).toBe(0);
        expect(drained.values.correctnessStatus).toBe("safe");
      });
    });

    describe("Immediate-Finish audit", () => {
      it("zero candidate actions, Finish immediately -> declared_unstable (expected default)", () => {
        const state = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(apiMigrationDualWriteFailureSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });

      it("Finish immediately at T=0, before the incident has even started -> declared_unstable", () => {
        const state = createInitialState(apiMigrationDualWriteFailureSimulation);
        const result = evaluateCandidateDeclaredFinish(apiMigrationDualWriteFailureSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });
    });
  });

  describe("Multi-step / alternate strong paths", () => {
    it("alternate strong path A: freeze to Legacy, reconcile fully, declare rollback-legacy -- reaches OPTIMAL", () => {
      const state = runScenario(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS,
      );
      const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      expect(state.values.correctnessStatus).toBe("safe");
      expect(state.values.authoritativeWriteSource).toBe("legacy-only");
    });

    it("alternate strong path B: freeze to New, reconcile fully, roll out to 100%, declare continue-new -- also reaches OPTIMAL", () => {
      const state = runScenario(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_NEW_ACTIONS,
      );
      const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      expect(state.values.correctnessStatus).toBe("safe");
      expect(state.values.authoritativeWriteSource).toBe("new-only");
    });

    it("a bounded, draining-but-not-fully-reconciled state is ACCEPTABLE, distinct from OPTIMAL", () => {
      const draining = runScenario(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3_000, controlKey: REPAIR_PRIORITY_KEY, value: "critical-first" },
      ]);
      const eligibility = evaluateCompletionEligibility(apiMigrationDualWriteFailureSimulation, draining);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(draining.values.unreconciledDivergentRecordCount as number).toBeGreaterThan(0);
    });
  });

  describe("Scoring", () => {
    function scoreRun(untilMs: number, actions: TimedAction[] = []) {
      const state = runScenario(untilMs, actions);
      const result = evaluateCandidateDeclaredFinish(apiMigrationDualWriteFailureSimulation, state);
      const inputs = extractFinishScoringInputs(apiMigrationDualWriteFailureSimulation, result);
      return { state, result, score: scoreAuthoredAttempt(API_MIGRATION_DUAL_WRITE_FAILURE_SCORING, inputs) };
    }

    it("optimal path (freeze + fully reconcile + declare rollback-legacy) scores at or near the top", () => {
      const { result, score } = scoreRun(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS,
      );
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThanOrEqual(700);
    });

    it("alternate strong path (continue-new) also scores at or near the top on dataIntegrity/reliability", () => {
      const { result, score } = scoreRun(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_NEW_ACTIONS,
      );
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
    });

    it("acceptable path (frozen + draining, not yet fully reconciled) scores full dataIntegrity but NOT full reliability", () => {
      const { result, score } = scoreRun(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
      ]);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(60);
    });

    it("baseline (no action) never resolves -- forced to use raw simulate() state for scoring inputs, scores poorly", () => {
      const state = runScenario(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(apiMigrationDualWriteFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");

      const inputs = extractFinishScoringInputs(apiMigrationDualWriteFailureSimulation, result);
      const score = scoreAuthoredAttempt(API_MIGRATION_DUAL_WRITE_FAILURE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      expect(score.total).toBeLessThan(400);
    });

    it("harmful path (replay-blind corrupts data) scores materially worse on dataIntegrity despite a lower raw divergence count", () => {
      const { score: blindReplayScore } = scoreRun(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000, [
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: "replay-blind" },
      ]);
      const { score: baselineScore } = scoreRun(DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 20_000);

      // Even though replay-blind's raw divergence count is LOWER than
      // baseline's, its dataIntegrity score is NOT better -- the
      // correctness violation (blind-replay corruption) dominates.
      expect(blindReplayScore.breakdown.dataIntegrity).toBe(30);
      expect(blindReplayScore.breakdown.dataIntegrity).toBeLessThanOrEqual(
        baselineScore.breakdown.dataIntegrity,
      );
    });

    it("harmful unsafe-sequence path (rollback before reconcile) scores materially worse on dataIntegrity despite excellent availability", () => {
      const { score } = scoreRun(
        DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 10_000,
        UNSAFE_ROLLBACK_BEFORE_RECONCILE_ACTIONS,
      );
      expect(score.breakdown.dataIntegrity).toBe(30);
    });

    it("sanity check: acceptable tier never outscores optimal for the same scenario", () => {
      const { score: acceptableScore } = scoreRun(RECONCILIATION_PARTIALLY_DRAINED_MS + 40_000, [
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 1_000, controlKey: WRITE_MODE_KEY, value: "new-only" },
        { atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "diff-and-repair" },
      ]);
      const { score: optimalScore } = scoreRun(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS,
      );
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
    });
  });

  describe("Determinism", () => {
    it("running the exact same action sequence twice produces identical final state and score", () => {
      const run1 = runScenario(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS,
      );
      const run2 = runScenario(
        RECONCILIATION_WINDOW_ELAPSED_MS + 35_000,
        SAFE_FREEZE_AND_RECONCILE_LEGACY_ACTIONS,
      );
      expect(run1.values).toEqual(run2.values);
      expect(run1.transitions.incidentState).toEqual(run2.transitions.incidentState);
    });
  });
});
