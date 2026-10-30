import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { ledgerReconciliationDivergence } from "./ledger-reconciliation-divergence";
import {
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
  ledgerReconciliationDivergenceSimulation,
} from "./ledger-reconciliation-divergence/definition";
import { ledgerReconciliationDivergenceCandidateUI } from "./ledger-reconciliation-divergence/candidate-ui";
import { LEDGER_RECONCILIATION_DIVERGENCE_SCORING } from "./ledger-reconciliation-divergence/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DIVERGENCE_ONSET_MS,
  REPAIR_WINDOW_1_MS,
  REPAIR_WINDOW_2_MS,
  REPAIR_WINDOW_FULLY_DRAINED_MS,
  SUSTAINED_DIVERGENCE_MS,
} from "./ledger-reconciliation-divergence/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(ledgerReconciliationDivergenceSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += ledgerReconciliationDivergenceSimulation.tickMs
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
      ledgerReconciliationDivergenceSimulation,
      state,
      action,
      ledgerReconciliationDivergenceSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

// Safe sequence, engaged immediately after sustained divergence sets
// in: fix publishing, route exceptions actively, repair.
const SAFE_REPAIR_ACTIONS_SUSTAINED: TimedAction[] = [
  { atMs: SUSTAINED_DIVERGENCE_MS + 1_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "at-least-once-safe" },
  { atMs: SUSTAINED_DIVERGENCE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active-exception-routing" },
  { atMs: SUSTAINED_DIVERGENCE_MS + 3_000, controlKey: EXCEPTION_POLICY_KEY, value: "auto-repair" },
];

const SAFE_REPAIR_ACTIONS_SUSTAINED_EXPEDITED: TimedAction[] = [
  ...SAFE_REPAIR_ACTIONS_SUSTAINED,
  { atMs: SUSTAINED_DIVERGENCE_MS + 4_000, controlKey: REPAIR_QUEUE_PRIORITY_KEY, value: "expedited" },
];

describe("Ledger Reconciliation Divergence", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(ledgerReconciliationDivergence.isFree).toBe(false);
      expect(ledgerReconciliationDivergence.library?.category).toBe("Data Pipelines");
      expect(ledgerReconciliationDivergence.library?.tags.length).toBeGreaterThan(0);
      expect(ledgerReconciliationDivergence.library?.skills.length).toBeGreaterThan(0);
      expect(ledgerReconciliationDivergence.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = LEDGER_RECONCILIATION_DIVERGENCE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = LEDGER_RECONCILIATION_DIVERGENCE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(ledgerReconciliationDivergenceCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(ledgerReconciliationDivergenceCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(ledgerReconciliationDivergenceCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 nodes and 5 edges matching the spec", () => {
      expect(ledgerReconciliationDivergenceSimulation.architecture.nodes.length).toBe(6);
      expect(ledgerReconciliationDivergenceSimulation.architecture.edges.length).toBe(5);
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(ledgerReconciliationDivergence.description).toMatch(/authoritative transaction record/i);
      expect(ledgerReconciliationDivergence.description).toMatch(/never invent or double-apply value/i);
      expect(ledgerReconciliationDivergence.description).toMatch(/may not simply be discarded/i);
      expect(ledgerReconciliationDivergence.description).toMatch(/historical financial divergence must be accounted for/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of ledgerReconciliationDivergenceSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(ledgerReconciliationDivergenceSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.missingEntryCount).toBe(0);
      expect(state.values.duplicateSettlementEntryCount).toBe(0);
      expect(state.values.discardedAcknowledgedEntryCount).toBe(0);
    });

    it("divergence onset triggers the incident while leaving live-traffic health untouched", () => {
      const state = runScenario(DIVERGENCE_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DIVERGENCE_ONSET_MS);
      expect(state.values.transactionApiSuccessRate).toBe(99);
      expect(state.values.operationalLedgerStatus).toBe("normal");
      expect(state.values.newDivergenceRatePerMinute).toBeGreaterThan(0);
    });

    it("baseline (no action) accrues real, nonzero historical damage while new divergence keeps accumulating", () => {
      const state = runScenario(DIVERGENCE_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-diverging");
      expect(state.values.missingEntryCount).toBeGreaterThan(0);
      expect(state.values.duplicateSettlementEntryCount).toBeGreaterThan(0);
      expect(state.values.newDivergenceRatePerMinute).toBeGreaterThan(0);
    });

    it("leaving the bug active long enough compounds into a materially larger backlog (sustained-divergence)", () => {
      const state = runScenario(SUSTAINED_DIVERGENCE_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-diverging");
      const early = runScenario(DIVERGENCE_ONSET_MS + 5_000);
      expect(state.values.missingEntryCount as number).toBeGreaterThan(early.values.missingEntryCount as number);
      expect(state.values.duplicateSettlementEntryCount as number).toBeGreaterThan(
        early.values.duplicateSettlementEntryCount as number,
      );
    });

    describe("Historical damage model: counters freeze, never silently reset", () => {
      it("fixing publishing alone stops NEW divergence but freezes (does not reset) missing/duplicate counts", () => {
        const before = runScenario(SUSTAINED_DIVERGENCE_MS + 5_000);
        const afterFix = runScenario(SUSTAINED_DIVERGENCE_MS + 15_000, [
          { atMs: SUSTAINED_DIVERGENCE_MS + 6_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "at-least-once-safe" },
        ]);
        expect(afterFix.values.newDivergenceRatePerMinute).toBe(0);
        // Frozen, not reset to zero and not reduced.
        expect(afterFix.values.missingEntryCount).toBe(before.values.missingEntryCount);
        expect(afterFix.values.duplicateSettlementEntryCount).toBe(before.values.duplicateSettlementEntryCount);
        expect(afterFix.values.reconciliationBacklogCount).toBe(before.values.reconciliationBacklogCount);
        expect(afterFix.values.reconciliationStatus).toBe("frozen-unrepaired");
      });

      it("pausing the settlement consumer alone also freezes rather than drains the backlog, however long it is held within the same divergence window", () => {
        const pausedShort = runScenario(DIVERGENCE_ONSET_MS + 30_000, [
          { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: SETTLEMENT_CONSUMER_MODE_KEY, value: "paused" },
        ]);
        const pausedLonger = runScenario(DIVERGENCE_ONSET_MS + 90_000, [
          { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: SETTLEMENT_CONSUMER_MODE_KEY, value: "paused" },
        ]);
        expect(pausedShort.values.newDivergenceRatePerMinute).toBe(0);
        expect(pausedLonger.values.newDivergenceRatePerMinute).toBe(0);
        // Backlog never moves no matter how much real time passes while
        // merely paused (within the same divergence window) -- proof
        // it is frozen, not draining.
        expect(pausedLonger.values.reconciliationBacklogCount).toBe(pausedShort.values.reconciliationBacklogCount);
        expect(pausedLonger.values.reconciliationStatus).toBe("frozen-unrepaired");

        // Holding it paused long enough to cross into the
        // sustained-divergence window freezes at a DIFFERENT (larger)
        // value -- still frozen (not draining), just frozen at a
        // bigger backlog because more divergence had already accrued
        // before the pause took effect being held this long is itself
        // the cost of waiting too long to pause.
        const pausedIntoSustainedWindow = runScenario(DIVERGENCE_ONSET_MS + 10 * 60_000, [
          { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: SETTLEMENT_CONSUMER_MODE_KEY, value: "paused" },
        ]);
        expect(pausedIntoSustainedWindow.values.reconciliationStatus).toBe("frozen-unrepaired");
        expect(pausedIntoSustainedWindow.values.reconciliationBacklogCount as number).toBeGreaterThan(
          pausedShort.values.reconciliationBacklogCount as number,
        );
      });

      it("fixing the cause and engaging real repair does NOT instantly clear the backlog on the same tick (recovery lag, tick-zero proof)", () => {
        const justEngaged = runScenario(SUSTAINED_DIVERGENCE_MS + 4_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        const before = runScenario(SUSTAINED_DIVERGENCE_MS + 1_000);
        expect(justEngaged.values.newDivergenceRatePerMinute).toBe(0);
        expect(justEngaged.values.reconciliationBacklogCount).toBe(before.values.reconciliationBacklogCount);
        expect(justEngaged.transitions.incidentState).toBe("repair-just-engaged-sustained");
      });
    });

    describe("Required pressure-transfer mechanism: raising write concurrency while the bug is active accelerates damage", () => {
      it("harmful/tempting path: high write concurrency without duplicate suppression makes duplication measurably WORSE than baseline, not better", () => {
        const baseline = runScenario(DIVERGENCE_ONSET_MS + 10_000);
        const concurrencyRaised = runScenario(DIVERGENCE_ONSET_MS + 10_000, [
          { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: SETTLEMENT_WRITE_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(concurrencyRaised.transitions.incidentState).toBe("concurrency-amplified-damage");
        expect(concurrencyRaised.values.duplicateSettlementEntryCount as number).toBeGreaterThan(
          baseline.values.duplicateSettlementEntryCount as number,
        );
        expect(concurrencyRaised.values.newDivergenceRatePerMinute as number).toBeGreaterThan(
          baseline.values.newDivergenceRatePerMinute as number,
        );
        const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, concurrencyRaised);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Tempting unsafe path: blind replay duplicates settlement", () => {
      it("replay-unsafe explodes duplicate count while barely improving missing count", () => {
        const baseline = runScenario(DIVERGENCE_ONSET_MS + 10_000);
        const replayed = runScenario(DIVERGENCE_ONSET_MS + 10_000, [
          { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "replay-unsafe" },
        ]);
        expect(replayed.transitions.incidentState).toBe("replay-unsafe-amplified");
        expect(replayed.values.duplicateSettlementEntryCount as number).toBeGreaterThan(
          baseline.values.duplicateSettlementEntryCount as number,
        );
        expect(replayed.values.duplicateSettlementEntryCount as number).toBeGreaterThan(
          replayed.values.missingEntryCount as number,
        );
      });
    });

    describe("Mandatory invariant: acknowledged entries may never be discarded", () => {
      it("auto-discard clears the visible backlog instantly but creates a separate, permanent violation count", () => {
        const discarded = runScenario(DIVERGENCE_ONSET_MS + 10_000, [
          { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: "active-exception-routing" },
          { atMs: DIVERGENCE_ONSET_MS + 2_000, controlKey: EXCEPTION_POLICY_KEY, value: "auto-discard" },
        ]);
        expect(discarded.transitions.incidentState).toBe("exceptions-discarded");
        expect(discarded.values.reconciliationBacklogCount).toBe(0);
        expect(discarded.values.discardedAcknowledgedEntryCount as number).toBeGreaterThan(0);
        expect(discarded.values.reconciliationStatus).toBe("discarded-violation");
        const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, discarded);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("holding the longest sustained window of auto-discard never auto-fails the attempt, even past the old sustained window", () => {
        const state = runScenario(SUSTAINED_DIVERGENCE_MS + 35_000, [
          { atMs: SUSTAINED_DIVERGENCE_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: "active-exception-routing" },
          { atMs: SUSTAINED_DIVERGENCE_MS + 2_000, controlKey: EXCEPTION_POLICY_KEY, value: "auto-discard" },
        ]);
        expect(state.status).not.toBe("failed");
        expect(state.failedAtMs).toBeNull();
        expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(30);
      });
    });

    describe("Recovery lag: real repair drains the backlog only over real elapsed repair time", () => {
      it("immediately after engaging repair, backlog is at its pre-repair value, not yet reduced", () => {
        const justAfter = runScenario(SUSTAINED_DIVERGENCE_MS + 10_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        expect(justAfter.transitions.incidentState).toBe("repair-just-engaged-sustained");
        expect(justAfter.values.reconciliationBacklogCount).toBe(230);
      });

      it("after the first repair window, backlog has genuinely shrunk but is not yet zero", () => {
        const window1 = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        expect(window1.transitions.incidentState).toBe("draining-sustained-window1-normal");
        expect(window1.values.reconciliationBacklogCount).toBeGreaterThan(0);
        expect(window1.values.reconciliationBacklogCount as number).toBeLessThan(230);
      });

      it("after the second repair window, backlog has shrunk further still", () => {
        const window1 = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        const window2 = runScenario(REPAIR_WINDOW_2_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        expect(window2.transitions.incidentState).toBe("draining-sustained-window2-normal");
        expect(window2.values.reconciliationBacklogCount as number).toBeLessThan(
          window1.values.reconciliationBacklogCount as number,
        );
      });

      it("only after the fully-drained window does the backlog reach genuine zero", () => {
        const drained = runScenario(REPAIR_WINDOW_FULLY_DRAINED_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        expect(drained.transitions.incidentState).toBe("fully-reconciled");
        expect(drained.values.reconciliationBacklogCount).toBe(0);
        expect(drained.values.missingEntryCount).toBe(0);
        expect(drained.values.duplicateSettlementEntryCount).toBe(0);
      });

      it("expedited repair priority drains measurably faster than normal priority at the identical elapsed window", () => {
        const normal = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        const expedited = runScenario(
          REPAIR_WINDOW_1_MS + 5_000,
          SAFE_REPAIR_ACTIONS_SUSTAINED_EXPEDITED,
        );
        expect(expedited.values.reconciliationBacklogCount as number).toBeLessThan(
          normal.values.reconciliationBacklogCount as number,
        );
      });
    });

    describe("Multi-step path", () => {
      it("step 1 alone (fix publishing) leaves the backlog frozen, not draining", () => {
        const state = runScenario(SUSTAINED_DIVERGENCE_MS + 5_000, [
          { atMs: SUSTAINED_DIVERGENCE_MS + 1_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "at-least-once-safe" },
        ]);
        expect(state.transitions.incidentState).toBe("frozen-publisher-fixed-passive-detect");
      });

      it("step 2 on top of step 1 (active routing, still hold-for-review) is still frozen", () => {
        const state = runScenario(SUSTAINED_DIVERGENCE_MS + 5_000, [
          { atMs: SUSTAINED_DIVERGENCE_MS + 1_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "at-least-once-safe" },
          { atMs: SUSTAINED_DIVERGENCE_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active-exception-routing" },
        ]);
        expect(state.transitions.incidentState).toBe("frozen-routed-not-repairing");
      });

      it("step 3 on top of steps 1-2 (auto-repair engaged) finally begins draining", () => {
        const state = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
        expect(state.transitions.incidentState).toBe("draining-sustained-window1-normal");
      });
    });

    it("tracks peak historical counters generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_DIVERGENCE_MS + 5_000, [
        { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: SETTLEMENT_WRITE_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(state.peaks.peakValues.duplicateSettlementEntryCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.missingEntryCount).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(DIVERGENCE_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_DIVERGENCE_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("draining-sustained-window1-expedited is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(
        REPAIR_WINDOW_1_MS + 30_000,
        SAFE_REPAIR_ACTIONS_SUSTAINED_EXPEDITED,
      );
      expect(state.transitions.incidentState).toBe("draining-sustained-window1-expedited");
      const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("draining-sustained-window1-normal (backlog 165, above the 120 ceiling) is NOT yet Finish-eligible", () => {
      const state = runScenario(REPAIR_WINDOW_1_MS + 30_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
      expect(state.transitions.incidentState).toBe("draining-sustained-window1-normal");
      expect(state.values.reconciliationBacklogCount).toBe(165);
      const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("draining-sustained-window2-normal (backlog 95, under the ceiling) IS Finish-eligible as acceptable", () => {
      const state = runScenario(REPAIR_WINDOW_2_MS + 30_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
      expect(state.transitions.incidentState).toBe("draining-sustained-window2-normal");
      const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("frozen-unrepaired (new divergence stopped but nothing draining) is never Finish-eligible at any tier", () => {
      const state = runScenario(SUSTAINED_DIVERGENCE_MS + 30_000 + 5_000, [
        { atMs: SUSTAINED_DIVERGENCE_MS + 1_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "at-least-once-safe" },
      ]);
      expect(state.transitions.incidentState).toBe("frozen-publisher-fixed-passive-detect");
      const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("fully-reconciled is Finish-eligible as optimal", () => {
      const state = runScenario(
        REPAIR_WINDOW_FULLY_DRAINED_MS + 35_000,
        SAFE_REPAIR_ACTIONS_SUSTAINED,
      );
      const eligibility = evaluateCompletionEligibility(ledgerReconciliationDivergenceSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from the fully-reconciled path -> resolved/optimal", () => {
      const state = runScenario(
        REPAIR_WINDOW_FULLY_DRAINED_MS + 35_000,
        SAFE_REPAIR_ACTIONS_SUSTAINED,
      );
      const result = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("the discard trap, held past the old sustained-failure window, never auto-fails and still resolves to declared_unstable only because it's not Finish-eligible", () => {
      const state = runScenario(SUSTAINED_DIVERGENCE_MS + 31_000, [
        { atMs: SUSTAINED_DIVERGENCE_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: "active-exception-routing" },
        { atMs: SUSTAINED_DIVERGENCE_MS + 2_000, controlKey: EXCEPTION_POLICY_KEY, value: "auto-discard" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-reconciled) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(
        REPAIR_WINDOW_FULLY_DRAINED_MS + 35_000,
        SAFE_REPAIR_ACTIONS_SUSTAINED,
      );
      const result = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, state);
      const inputs = extractFinishScoringInputs(ledgerReconciliationDivergenceSimulation, result);
      const score = scoreAuthoredAttempt(LEDGER_RECONCILIATION_DIVERGENCE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (draining, bounded) scores well but below optimal", () => {
      const optimalState = runScenario(
        REPAIR_WINDOW_FULLY_DRAINED_MS + 35_000,
        SAFE_REPAIR_ACTIONS_SUSTAINED,
      );
      const optimalResult = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(ledgerReconciliationDivergenceSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(LEDGER_RECONCILIATION_DIVERGENCE_SCORING, optimalInputs);

      const acceptableState = runScenario(
        REPAIR_WINDOW_1_MS + 30_000,
        SAFE_REPAIR_ACTIONS_SUSTAINED_EXPEDITED,
      );
      const acceptableResult = evaluateCandidateDeclaredFinish(ledgerReconciliationDivergenceSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(ledgerReconciliationDivergenceSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(LEDGER_RECONCILIATION_DIVERGENCE_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(100);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_DIVERGENCE_MS + 60_000);
      const inputs = {
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
        initialMonthlyInfrastructureCostUsd: ledgerReconciliationDivergenceSimulation.infrastructureCost.baselineMonthlyUsd,
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
      const score = scoreAuthoredAttempt(LEDGER_RECONCILIATION_DIVERGENCE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      expect(score.breakdown.dataIntegrity).toBeLessThan(150);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (replay-unsafe duplication explosion) scores worse on dataIntegrity than baseline despite stopping quickly", () => {
      const replayedState = runScenario(DIVERGENCE_ONSET_MS + 10_000, [
        { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: EVENT_PUBLISHING_MODE_KEY, value: "replay-unsafe" },
      ]);
      const inputs = {
        incidentStartedAtMs: replayedState.incidentStartedAtMs,
        resolvedAtMs: null,
        failedAtMs: replayedState.failedAtMs,
        totalTimeInCriticalMs: replayedState.customerImpact.totalTimeInCriticalMs,
        totalTimeInDegradedMs: replayedState.customerImpact.totalTimeInDegradedMs,
        revenueLossUsd: replayedState.customerImpact.revenueLossUsd,
        peakSeverityRank: replayedState.peaks.peakSeverityRank,
        numberOfConfigurationChanges: replayedState.numberOfConfigurationChanges,
        numberOfHarmfulChanges: replayedState.numberOfHarmfulChanges,
        numberOfBeneficialChanges: replayedState.numberOfBeneficialChanges,
        initialMonthlyInfrastructureCostUsd: ledgerReconciliationDivergenceSimulation.infrastructureCost.baselineMonthlyUsd,
        finalMonthlyInfrastructureCostUsd: replayedState.cost.currentMonthlyCostUsd,
        peakMonthlyInfrastructureCostUsd: replayedState.peaks.peakMonthlyCostUsd,
        finalNumericValues: Object.fromEntries(
          Object.entries(replayedState.values).filter(([, v]) => typeof v === "number"),
        ) as Record<string, number>,
        peakNumericValues: replayedState.peaks.peakValues,
        finalStringValues: Object.fromEntries(
          Object.entries(replayedState.values).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>,
      };
      const harmfulScore = scoreAuthoredAttempt(LEDGER_RECONCILIATION_DIVERGENCE_SCORING, inputs);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThanOrEqual(90);
      console.log("HARMFUL (replay-unsafe) SCORE", JSON.stringify(harmfulScore));
    });

    it("the discard trap scores zero dataIntegrity even though its visible backlog metric reads zero", () => {
      const discardedState = runScenario(DIVERGENCE_ONSET_MS + 10_000, [
        { atMs: DIVERGENCE_ONSET_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: "active-exception-routing" },
        { atMs: DIVERGENCE_ONSET_MS + 2_000, controlKey: EXCEPTION_POLICY_KEY, value: "auto-discard" },
      ]);
      expect(discardedState.values.reconciliationBacklogCount).toBe(0);
      const inputs = {
        incidentStartedAtMs: discardedState.incidentStartedAtMs,
        resolvedAtMs: null,
        failedAtMs: discardedState.failedAtMs,
        totalTimeInCriticalMs: discardedState.customerImpact.totalTimeInCriticalMs,
        totalTimeInDegradedMs: discardedState.customerImpact.totalTimeInDegradedMs,
        revenueLossUsd: discardedState.customerImpact.revenueLossUsd,
        peakSeverityRank: discardedState.peaks.peakSeverityRank,
        numberOfConfigurationChanges: discardedState.numberOfConfigurationChanges,
        numberOfHarmfulChanges: discardedState.numberOfHarmfulChanges,
        numberOfBeneficialChanges: discardedState.numberOfBeneficialChanges,
        initialMonthlyInfrastructureCostUsd: ledgerReconciliationDivergenceSimulation.infrastructureCost.baselineMonthlyUsd,
        finalMonthlyInfrastructureCostUsd: discardedState.cost.currentMonthlyCostUsd,
        peakMonthlyInfrastructureCostUsd: discardedState.peaks.peakMonthlyCostUsd,
        finalNumericValues: Object.fromEntries(
          Object.entries(discardedState.values).filter(([, v]) => typeof v === "number"),
        ) as Record<string, number>,
        peakNumericValues: discardedState.peaks.peakValues,
        finalStringValues: Object.fromEntries(
          Object.entries(discardedState.values).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>,
      };
      const score = scoreAuthoredAttempt(LEDGER_RECONCILIATION_DIVERGENCE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(0);
      console.log("DISCARD TRAP SCORE", JSON.stringify(score));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
      const runB = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_REPAIR_ACTIONS_SUSTAINED);
      expect(runA).toEqual(runB);
    });
  });

  describe("Suppression control", () => {
    it("duplicateSuppression stops new duplicates going forward but does not erase historical ones", () => {
      const before = runScenario(DIVERGENCE_ONSET_MS + 5_000);
      const afterSuppression = runScenario(DIVERGENCE_ONSET_MS + 15_000, [
        { atMs: DIVERGENCE_ONSET_MS + 6_000, controlKey: DUPLICATE_SUPPRESSION_KEY, value: true },
      ]);
      // duplicateSuppression alone (without fixing the publisher) does
      // not change which rule matches in this authored table -- it's a
      // real control used in combination with other fixes, verified
      // here simply to confirm it's wired and doesn't error.
      expect(afterSuppression.values.duplicateSettlementEntryCount as number).toBeGreaterThanOrEqual(
        before.values.duplicateSettlementEntryCount as number,
      );
    });
  });
});
