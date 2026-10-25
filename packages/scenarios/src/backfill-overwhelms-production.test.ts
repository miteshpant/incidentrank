import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { backfillOverwhelmsProduction } from "./backfill-overwhelms-production";
import {
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
  backfillOverwhelmsProductionSimulation,
} from "./backfill-overwhelms-production/definition";
import { backfillOverwhelmsProductionCandidateUI } from "./backfill-overwhelms-production/candidate-ui";
import { BACKFILL_OVERWHELMS_PRODUCTION_SCORING } from "./backfill-overwhelms-production/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CONTENTION_ONSET_MS,
  MIGRATION_DEADLINE_MS,
  RECOVERY_WINDOW_1_MS,
  RECOVERY_WINDOW_FULLY_STABLE_MS,
  RESUME_DRAIN_FULLY_COMPLETE_MS,
  RESUME_DRAIN_WINDOW_1_MS,
  RESUME_DRAIN_WINDOW_2_MS,
  SKIP_EXPOSURE_WINDOW_MS,
  SUSTAINED_CONTENTION_MS,
} from "./backfill-overwhelms-production/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(backfillOverwhelmsProductionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += backfillOverwhelmsProductionSimulation.tickMs
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
      backfillOverwhelmsProductionSimulation,
      state,
      action,
      backfillOverwhelmsProductionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function scoringInputsFromState(state: ReturnType<typeof runScenario>) {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: null,
    failedAtMs: state.failedAtMs,
    totalTimeInCriticalMs: state.customerImpact.totalTimeInCriticalMs,
    totalTimeInDegradedMs: state.customerImpact.totalTimeInDegradedMs,
    revenueLossUsd: state.customerImpact.revenueLossUsd,
    peakSeverityRank: state.peaks.peakSeverityRank,
    numberOfConfigurationChanges: state.numberOfConfigurationChanges,
    numberOfHarmfulChanges: state.numberOfHarmfulChanges,
    numberOfBeneficialChanges: state.numberOfBeneficialChanges,
    initialMonthlyInfrastructureCostUsd: backfillOverwhelmsProductionSimulation.infrastructureCost.baselineMonthlyUsd,
    finalMonthlyInfrastructureCostUsd: state.cost.currentMonthlyCostUsd,
    peakMonthlyInfrastructureCostUsd: state.peaks.peakMonthlyCostUsd,
    finalNumericValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>,
    peakNumericValues: state.peaks.peakValues,
    finalStringValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
  };
}

// Safe sequence: pause briefly isn't required — the strong path reshapes
// the backfill (chunk size + priority + dispatch throttle) and raises
// concurrency together, engaged right after sustained contention sets
// in.
const SAFE_RESHAPE_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_CHUNK_SIZE_KEY, value: "small" },
  { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
  { atMs: SUSTAINED_CONTENTION_MS + 3_000, controlKey: QUEUE_DISPATCH_RATE_KEY, value: "throttled" },
  { atMs: SUSTAINED_CONTENTION_MS + 4_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
];

// Unsafe sequence: raise concurrency FIRST, before reshaping anything.
const NAIVE_CONCURRENCY_ONLY_ACTIONS: TimedAction[] = [
  { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
];

describe("Backfill Overwhelms Production", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(backfillOverwhelmsProduction.isFree).toBe(false);
      expect(backfillOverwhelmsProduction.library?.category).toBe("Databases & Storage");
      expect(backfillOverwhelmsProduction.library?.tags.length).toBeGreaterThan(0);
      expect(backfillOverwhelmsProduction.library?.skills.length).toBeGreaterThan(0);
      expect(backfillOverwhelmsProduction.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = BACKFILL_OVERWHELMS_PRODUCTION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = BACKFILL_OVERWHELMS_PRODUCTION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(backfillOverwhelmsProductionCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(backfillOverwhelmsProductionCandidateUI.controls.length).toBe(8);
      expect(backfillOverwhelmsProductionCandidateUI.components.length).toBe(5);
    });

    it("the architecture has exactly 5 nodes and 4 edges matching the spec, with no Read Replica node", () => {
      expect(backfillOverwhelmsProductionSimulation.architecture.nodes.length).toBe(5);
      expect(backfillOverwhelmsProductionSimulation.architecture.edges.length).toBe(4);
      expect(
        backfillOverwhelmsProductionSimulation.architecture.nodes.some((n) => /replica/i.test(n.label)),
      ).toBe(false);
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(backfillOverwhelmsProduction.description).toMatch(/correct and available within the authored SLO/i);
      expect(backfillOverwhelmsProduction.description).toMatch(/may slow or pause temporarily/i);
      expect(backfillOverwhelmsProduction.description).toMatch(/must not be skipped or silently marked complete/i);
      expect(backfillOverwhelmsProduction.description).toMatch(/deadline genuinely matters/i);
      expect(backfillOverwhelmsProduction.description).toMatch(/never outranks production correctness/i);
      expect(backfillOverwhelmsProduction.description).toMatch(/safe production resource budget/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of backfillOverwhelmsProductionSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every declared control is referenced by at least one action classification", () => {
      const controlKeys = backfillOverwhelmsProductionSimulation.controls.map((c) => c.key);
      const classifiedKeys = new Set(
        backfillOverwhelmsProductionSimulation.actionClassifications.map((c) => c.controlKey),
      );
      for (const key of controlKeys) {
        expect(classifiedKeys.has(key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(backfillOverwhelmsProductionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.dbLockWaitMs).toBe(0);
      expect(state.values.skippedRowCount).toBe(0);
      expect(state.values.backfillQueueDepth).toBe(48_000);
    });

    it("contention onset triggers the incident", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(CONTENTION_ONSET_MS);
      expect(state.values.dbLockWaitMs as number).toBeGreaterThan(0);
    });

    it("baseline (no action) shows growing lock wait and latency", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-contention");
      expect(state.values.productionDatabaseStatus).toBe("contending");
    });

    it("leaving contention unaddressed long enough compounds into a materially worse state (sustained)", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-contention");
      const early = runScenario(CONTENTION_ONSET_MS + 5_000);
      expect(state.values.dbLockWaitMs as number).toBeGreaterThan(early.values.dbLockWaitMs as number);
    });

    describe("Required pressure-transfer mechanism: backfill concurrency -> DB locks", () => {
      it("harmful/tempting path: raising concurrency alone makes DB contention measurably WORSE than baseline", () => {
        const baseline = runScenario(CONTENTION_ONSET_MS + 10_000);
        const naivelyScaled = runScenario(CONTENTION_ONSET_MS + 10_000, NAIVE_CONCURRENCY_ONLY_ACTIONS);
        expect(naivelyScaled.transitions.incidentState).toBe("high-concurrency-unmanaged-contention");
        expect(naivelyScaled.values.dbLockWaitMs as number).toBeGreaterThan(
          baseline.values.dbLockWaitMs as number,
        );
        expect(naivelyScaled.values.liveWriteP99Ms as number).toBeGreaterThan(
          baseline.values.liveWriteP99Ms as number,
        );
        expect(naivelyScaled.values.primaryDatabaseStatus).toBe("critical");
        const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, naivelyScaled);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("short statement timeout on top of unmanaged concurrency converts latency into explicit failures, not a free fix", () => {
        const unmanaged = runScenario(CONTENTION_ONSET_MS + 10_000, NAIVE_CONCURRENCY_ONLY_ACTIONS);
        const withShortTimeout = runScenario(CONTENTION_ONSET_MS + 10_000, [
          ...NAIVE_CONCURRENCY_ONLY_ACTIONS,
          { atMs: CONTENTION_ONSET_MS + 2_000, controlKey: DB_STATEMENT_TIMEOUT_MODE_KEY, value: "short" },
        ]);
        expect(withShortTimeout.transitions.incidentState).toBe("high-concurrency-unmanaged-short-timeout");
        expect(withShortTimeout.values.liveWriteTimeoutFailureCount as number).toBeGreaterThan(0);
        expect(withShortTimeout.values.requestSuccessRate as number).toBeLessThan(
          unmanaged.values.requestSuccessRate as number,
        );
      });

      it("partial protection (chunk size alone) reduces but does not eliminate contention", () => {
        const unprotected = runScenario(CONTENTION_ONSET_MS + 10_000, NAIVE_CONCURRENCY_ONLY_ACTIONS);
        const partiallyProtected = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
          { atMs: CONTENTION_ONSET_MS + 2_000, controlKey: BACKFILL_CHUNK_SIZE_KEY, value: "small" },
        ]);
        expect(partiallyProtected.transitions.incidentState).toBe(
          "high-concurrency-partial-protection-chunk-only",
        );
        expect(partiallyProtected.values.dbLockWaitMs as number).toBeLessThan(
          unprotected.values.dbLockWaitMs as number,
        );
        expect(partiallyProtected.values.dbLockWaitMs as number).toBeGreaterThan(60);
      });

      it("partial protection (priority alone) also reduces but does not eliminate contention", () => {
        const partiallyProtected = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
          { atMs: CONTENTION_ONSET_MS + 2_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
        ]);
        expect(partiallyProtected.transitions.incidentState).toBe(
          "high-concurrency-partial-protection-priority-only",
        );
        expect(partiallyProtected.values.dbLockWaitMs as number).toBeGreaterThan(60);
      });

      it("dispatch throttle is the remaining lever even after chunk size + priority + concurrency are set", () => {
        const unthrottled = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 5_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_CHUNK_SIZE_KEY, value: "small" },
          { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
          { atMs: SUSTAINED_CONTENTION_MS + 3_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(unthrottled.transitions.incidentState).toBe("protected-but-dispatch-unthrottled");
        const throttled = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        expect(throttled.values.dbLockWaitMs as number).toBeLessThan(
          unthrottled.values.dbLockWaitMs as number,
        );
      });
    });

    describe("Historical damage model: skipped rows never reset, even after the lever is turned off", () => {
      it("enabling skipMarkComplete creates a nonzero, permanent skippedRowCount", () => {
        const state = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        ]);
        expect(state.transitions.incidentState).toBe("skip-mark-complete-trap-active");
        expect(state.values.skippedRowCount as number).toBeGreaterThan(0);
        expect(state.values.productionDatabaseStatus).toBe("integrity-violated");
      });

      it("longer exposure to skipMarkComplete accrues a strictly larger historical count", () => {
        const shortExposure = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        ]);
        const longExposure = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        ]);
        expect(longExposure.values.skippedRowCount as number).toBeGreaterThan(
          shortExposure.values.skippedRowCount as number,
        );
      });

      it("turning skipMarkComplete back off stops NEW skips but never resets the historical count (scarred-but-live-safe)", () => {
        const scarred = runScenario(SKIP_EXPOSURE_WINDOW_MS + 60_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
          { atMs: SKIP_EXPOSURE_WINDOW_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: false },
        ]);
        expect(scarred.transitions.incidentState).toBe("skip-mark-complete-scarred-live-safe");
        expect(scarred.values.skippedRowCount as number).toBeGreaterThan(0);
        // Carried forward unchanged from whatever it last reached before
        // the lever was turned off — never re-derived from current state.
        expect(scarred.values.skippedRowCount).toBe(4_500);
        // Live metrics look pristine...
        expect(scarred.values.dbLockWaitMs).toBe(15);
        expect(scarred.values.requestSuccessRate).toBe(99.8);
        // ...but the historical damage still blocks Finish eligibility entirely.
        const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, scarred);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("holding skipMarkComplete long enough reaches automatic failure", () => {
        const state = runScenario(RECOVERY_WINDOW_1_MS + 35_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        ]);
        expect(state.transitions.incidentState).toBe("skip-mark-complete-trap-catastrophic");
        expect(state.values.skippedRowCount as number).toBeGreaterThanOrEqual(20_000);
        expect(state.status).toBe("failed");
        expect(state.failedAtMs).not.toBeNull();
      });

      it("tracks peak skippedRowCount for scoring even if it were ever to (hypothetically) read lower later", () => {
        const state = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        ]);
        expect(state.peaks.peakValues.skippedRowCount).toBeGreaterThan(0);
      });
    });

    describe("Recovery lag: real drain only over real elapsed time", () => {
      it("pausing is not instant: immediately after pausing, lock wait is still at its just-engaged value", () => {
        const justPausedEarly = runScenario(SUSTAINED_CONTENTION_MS + 5_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
        ]);
        const justPausedLater = runScenario(RECOVERY_WINDOW_1_MS - 1_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
        ]);
        expect(justPausedEarly.transitions.incidentState).toBe("paused-just-engaged");
        expect(justPausedLater.transitions.incidentState).toBe("paused-just-engaged");
        expect(justPausedLater.values.dbLockWaitMs).toBe(justPausedEarly.values.dbLockWaitMs);
        expect(justPausedEarly.values.dbLockWaitMs as number).toBeGreaterThan(60);
      });

      it("after the first recovery window, lock wait has genuinely dropped but is not yet fully stable", () => {
        const window1 = runScenario(RECOVERY_WINDOW_1_MS + 5_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
        ]);
        expect(window1.transitions.incidentState).toBe("paused-recovering-window1");
        expect(window1.values.dbLockWaitMs as number).toBeGreaterThan(0);
        expect(window1.values.dbLockWaitMs as number).toBeLessThan(780);
      });

      it("only after the fully-stable window does lock wait reach genuine zero while paused", () => {
        const stable = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 5_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
        ]);
        expect(stable.transitions.incidentState).toBe("paused-fully-stable");
        expect(stable.values.dbLockWaitMs).toBe(0);
        // Queue is frozen, not shrinking, while paused.
        expect(stable.values.backfillQueueDepth).toBe(40_000);
      });

      it("safe resume is not instant: just-engaged queue depth matches the moment of resume, not drained yet", () => {
        const justResumedEarly = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        const justResumedLater = runScenario(RESUME_DRAIN_WINDOW_1_MS - 1_000, SAFE_RESHAPE_ACTIONS);
        expect(justResumedEarly.transitions.incidentState).toBe("safely-resumed-just-engaged");
        expect(justResumedLater.transitions.incidentState).toBe("safely-resumed-just-engaged");
        expect(justResumedLater.values.backfillQueueDepth).toBe(justResumedEarly.values.backfillQueueDepth);
      });

      it("after the first resume-drain window, queue has genuinely shrunk but is not yet zero", () => {
        const window1 = runScenario(RESUME_DRAIN_WINDOW_1_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        expect(window1.transitions.incidentState).toBe("safely-resumed-draining-window1");
        expect(window1.values.backfillQueueDepth as number).toBeGreaterThan(0);
        expect(window1.values.backfillQueueDepth as number).toBeLessThan(40_000);
      });

      it("after the second resume-drain window, queue has shrunk further still", () => {
        const window1 = runScenario(RESUME_DRAIN_WINDOW_1_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        const window2 = runScenario(RESUME_DRAIN_WINDOW_2_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        expect(window2.transitions.incidentState).toBe("safely-resumed-draining-window2");
        expect(window2.values.backfillQueueDepth as number).toBeLessThan(
          window1.values.backfillQueueDepth as number,
        );
      });

      it("only after the fully-complete drain window does the queue reach genuine, honest zero", () => {
        const complete = runScenario(RESUME_DRAIN_FULLY_COMPLETE_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        expect(complete.transitions.incidentState).toBe("fully-resumed-complete");
        expect(complete.values.backfillQueueDepth).toBe(0);
        expect(complete.values.skippedRowCount).toBe(0);
      });
    });

    describe("Legitimate degraded-but-safe state: off-peak scheduling", () => {
      it("restricting the backfill to off-peak protects production without pausing forever", () => {
        const state = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: BACKFILL_SCHEDULING_WINDOW_KEY, value: "off-peak-only" },
        ]);
        expect(state.transitions.incidentState).toBe("off-peak-scheduling-protects-production");
        expect(state.values.productionDatabaseStatus).toBe("protected");
        expect(state.values.backfillQueueDepth as number).toBeGreaterThan(0);
      });
    });

    describe("Alternate strong path: medium concurrency, slower but safe", () => {
      it("medium concurrency with priority protection is genuinely safe but drains more slowly than the fully-protected high-concurrency path", () => {
        const mediumProtected = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 5_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "medium" },
          { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
        ]);
        expect(mediumProtected.transitions.incidentState).toBe("medium-concurrency-protected");
        expect(mediumProtected.values.primaryDatabaseStatus).toBe("normal");

        // Compare at the SAME elapsed time once the high-concurrency
        // path has had its first real resume-drain window to work with
        // (medium-concurrency-protected is authored as a flat, frozen
        // state with no further drain-window progression of its own —
        // an honest, real limitation of this alternate path, not a
        // decoy): the fully-protected high-concurrency path has
        // processed strictly more rows by this point.
        const highProtected = runScenario(RESUME_DRAIN_WINDOW_1_MS + 5_000, SAFE_RESHAPE_ACTIONS);
        expect(highProtected.transitions.incidentState).toBe("safely-resumed-draining-window1");
        expect(mediumProtected.values.backfillRowsCompletedCount as number).toBeLessThan(
          highProtected.values.backfillRowsCompletedCount as number,
        );
      });
    });

    describe("Sequencing sensitivity", () => {
      it("safe sequence: reshape first, THEN raise concurrency -> fully protected, never passes through the contention trap", () => {
        const state = runScenario(SUSTAINED_CONTENTION_MS + 10_000, SAFE_RESHAPE_ACTIONS);
        expect(state.transitions.incidentState).not.toBe("high-concurrency-unmanaged-contention");
        expect(state.peaks.peakValues.dbLockWaitMs as number).toBeLessThan(500);
      });

      it("unsafe sequence: raise concurrency FIRST, reshape later -> passes through real, measurable contention before being protected", () => {
        const unsafeOrder = runScenario(CONTENTION_ONSET_MS + 10_000, [
          { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "high" },
          { atMs: CONTENTION_ONSET_MS + 5_000, controlKey: BACKFILL_CHUNK_SIZE_KEY, value: "small" },
          { atMs: CONTENTION_ONSET_MS + 6_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
        ]);
        // Before the reshape actions land (at +1s to +5s), the simulation
        // genuinely passed through the unmanaged contention trap — proven
        // via the peak tracker, which never resets even once protection
        // is later applied.
        expect(unsafeOrder.peaks.peakValues.dbLockWaitMs as number).toBeGreaterThan(2_000);
      });
    });

    describe("Migration deadline: external pressure, never a production-health signal", () => {
      it("the deadline trigger fires purely from elapsed time and never changes DB/backfill state by itself", () => {
        const paused = runScenario(MIGRATION_DEADLINE_MS + 5_000, [
          { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
        ]);
        expect(paused.triggers.migrationDeadlineReached).toBe(true);
        // Still paused-fully-stable — the deadline firing did not itself
        // alter database/backfill health.
        expect(paused.transitions.incidentState).toBe("paused-fully-stable");
      });
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(CONTENTION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("paused-fully-stable is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 30_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
      ]);
      expect(state.transitions.incidentState).toBe("paused-fully-stable");
      const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("off-peak scheduling alone IS Finish-eligible as acceptable", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 32_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: BACKFILL_SCHEDULING_WINDOW_KEY, value: "off-peak-only" },
      ]);
      expect(state.transitions.incidentState).toBe("off-peak-scheduling-protects-production");
      const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("paused-just-engaged (lock wait 780, above the 60 ceiling) is NOT yet Finish-eligible", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 30_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
      ]);
      expect(state.transitions.incidentState).toBe("paused-just-engaged");
      const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("high-concurrency-unmanaged-contention is never Finish-eligible at any tier", () => {
      const state = runScenario(CONTENTION_ONSET_MS + 30_000, NAIVE_CONCURRENCY_ONLY_ACTIONS);
      expect(state.transitions.incidentState).toBe("high-concurrency-unmanaged-contention");
      const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("fully-resumed-complete is Finish-eligible as optimal", () => {
      const state = runScenario(RESUME_DRAIN_FULLY_COMPLETE_MS + 35_000, SAFE_RESHAPE_ACTIONS);
      const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from the fully-resumed-complete path -> resolved/optimal", () => {
      const state = runScenario(RESUME_DRAIN_FULLY_COMPLETE_MS + 35_000, SAFE_RESHAPE_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(RECOVERY_WINDOW_1_MS + 5_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("historical damage blocks Finish entirely even with pristine current health (scarred-but-live-safe)", () => {
      const state = runScenario(SKIP_EXPOSURE_WINDOW_MS + 60_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        { atMs: SKIP_EXPOSURE_WINDOW_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: false },
      ]);
      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-resumed-complete) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(RESUME_DRAIN_FULLY_COMPLETE_MS + 35_000, SAFE_RESHAPE_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, state);
      const inputs = extractFinishScoringInputs(backfillOverwhelmsProductionSimulation, result);
      const score = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (paused, bounded) scores well but below optimal", () => {
      const optimalState = runScenario(RESUME_DRAIN_FULLY_COMPLETE_MS + 35_000, SAFE_RESHAPE_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(backfillOverwhelmsProductionSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, optimalInputs);

      const acceptableState = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 30_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_PAUSE_RESUME_KEY, value: "paused" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(backfillOverwhelmsProductionSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit (unresolved)", () => {
      const state = runScenario(SUSTAINED_CONTENTION_MS + 30_000);
      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (unmanaged concurrency) scores WORSE than the zero-action baseline", () => {
      const baseline = runScenario(CONTENTION_ONSET_MS + 60_000);
      const baselineInputs = scoringInputsFromState(baseline);
      const baselineScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, baselineInputs);

      const harmful = runScenario(CONTENTION_ONSET_MS + 60_000, NAIVE_CONCURRENCY_ONLY_ACTIONS);
      const harmfulInputs = scoringInputsFromState(harmful);
      const harmfulScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, harmfulInputs);

      // Regression guard (Phase 6D.4 scoring closeout): at this later
      // elapsed time (past skipExposureWindowElapsed but still before
      // sustainedContention), the harmful concurrency path must still
      // land on the real pressure-transfer trap state, not be silently
      // shadowed by the unrelated skip-mark-complete-scarred-live-safe
      // rule — this scenario never touches SKIP_MARK_COMPLETE_KEY.
      expect(harmful.transitions.incidentState).toBe("high-concurrency-unmanaged-contention");
      expect(harmfulScore.breakdown.customerImpact).toBeLessThanOrEqual(baselineScore.breakdown.customerImpact);
      console.log("BASELINE SCORE", JSON.stringify(baselineScore));
      console.log("HARMFUL SCORE", JSON.stringify(harmfulScore));
    });

    it("the correctness-violating skip-mark-complete path is heavily penalized on dataIntegrity even with otherwise-clean metrics", () => {
      const state = runScenario(SKIP_EXPOSURE_WINDOW_MS + 60_000, [
        { atMs: CONTENTION_ONSET_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: true },
        { atMs: SKIP_EXPOSURE_WINDOW_MS + 1_000, controlKey: SKIP_MARK_COMPLETE_KEY, value: false },
      ]);
      // Pristine current health...
      expect(state.values.dbLockWaitMs).toBe(15);
      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, inputs);
      // ...but dataIntegrity still loses the overwhelming majority of
      // its points because historical damage cannot be improperly
      // erased by current health looking clean.
      expect(score.breakdown.dataIntegrity).toBeLessThanOrEqual(20);
      console.log("SKIP-MARK-COMPLETE SCARRED SCORE", JSON.stringify(score));
    });

    it("alternate strong path (medium concurrency, slower) scores according to its real tradeoffs: safe but slower than the fast strong path", () => {
      const fastStrong = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 30_000, SAFE_RESHAPE_ACTIONS);
      const fastInputs = scoringInputsFromState(fastStrong);
      const fastScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, fastInputs);

      const mediumStrong = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 30_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "medium" },
        { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
      ]);
      const mediumInputs = scoringInputsFromState(mediumStrong);
      const mediumScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, mediumInputs);

      // Both genuinely safe (full dataIntegrity credit), but medium
      // concurrency has processed fewer rows at the identical elapsed
      // time, which this scenario does not score directly — both are
      // legitimate, distinct strategies rather than one being a strict
      // decoy of the other.
      expect(mediumScore.breakdown.dataIntegrity).toBe(fastScore.breakdown.dataIntegrity);
      console.log("FAST-STRONG SCORE", JSON.stringify(fastScore));
      console.log("MEDIUM-STRONG SCORE", JSON.stringify(mediumScore));
    });

    // Regression guard (Phase 6D.4 scoring closeout): the two scores
    // logged above (FAST-STRONG / MEDIUM-STRONG, both ~350) are an
    // UNFINISHED mid-simulation comparison via scoringInputsFromState
    // (resolvedAtMs: null is hardcoded there), used only to prove the
    // two paths reach equal dataIntegrity credit — neither number is a
    // completion-tier score and neither should ever be read as
    // "optimal." If the candidate actually declares Finish on the
    // medium-concurrency path, it is real, Finish-eligible ACCEPTABLE
    // tier (not optimal — it is genuinely slower/less complete than the
    // fast path) and scores materially higher than the unfinished
    // snapshot once Recovery/Reliability credit is included.
    it("medium-strong path, if actually Finished, is Finish-eligible ACCEPTABLE (not optimal) and scores well above its own unfinished snapshot", () => {
      const mediumFinished = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 30_000, [
        { atMs: SUSTAINED_CONTENTION_MS + 1_000, controlKey: BACKFILL_CONCURRENCY_KEY, value: "medium" },
        { atMs: SUSTAINED_CONTENTION_MS + 2_000, controlKey: DB_PRIORITY_MODE_KEY, value: "live-traffic-first" },
      ]);
      const eligibility = evaluateCompletionEligibility(backfillOverwhelmsProductionSimulation, mediumFinished);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });

      const result = evaluateCandidateDeclaredFinish(backfillOverwhelmsProductionSimulation, mediumFinished);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");

      const finishInputs = extractFinishScoringInputs(backfillOverwhelmsProductionSimulation, result);
      const finishScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, finishInputs);
      expect(finishScore.total).toBe(800);

      const unfinishedInputs = scoringInputsFromState(mediumFinished);
      const unfinishedScore = scoreAuthoredAttempt(BACKFILL_OVERWHELMS_PRODUCTION_SCORING, unfinishedInputs);
      expect(finishScore.total).toBeGreaterThan(unfinishedScore.total);
    });
  });

  describe("Determinism", () => {
    it("identical action sequences produce identical final state", () => {
      const run1 = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 10_000, SAFE_RESHAPE_ACTIONS);
      const run2 = runScenario(RECOVERY_WINDOW_FULLY_STABLE_MS + 10_000, SAFE_RESHAPE_ACTIONS);
      expect(run1.values).toEqual(run2.values);
      expect(run1.transitions.incidentState).toBe(run2.transitions.incidentState);
      expect(run1.customerImpact.revenueLossUsd).toBe(run2.customerImpact.revenueLossUsd);
    });
  });
});
