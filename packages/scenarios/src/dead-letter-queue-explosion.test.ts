import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { deadLetterQueueExplosion } from "./dead-letter-queue-explosion";
import {
  CONSUMER_INSTANCE_COUNT_KEY,
  deadLetterQueueExplosionSimulation,
  DLQ_ACTION_KEY,
  PARSER_SCHEMA_COMPAT_MODE_KEY,
  REPLAY_FAILURE_FILTER_KEY,
  REPLAY_PAUSED_KEY,
  RETRY_DELAY_MS_KEY,
} from "./dead-letter-queue-explosion/definition";
import { deadLetterQueueExplosionCandidateUI } from "./dead-letter-queue-explosion/candidate-ui";
import { DEAD_LETTER_QUEUE_EXPLOSION_SCORING } from "./dead-letter-queue-explosion/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(deadLetterQueueExplosionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += deadLetterQueueExplosionSimulation.tickMs
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
      deadLetterQueueExplosionSimulation,
      state,
      action,
      deadLetterQueueExplosionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const SCHEMA_ISSUE_MS = 30_000;
const REPLAY_BACKLOG_CATCHUP_MS = SCHEMA_ISSUE_MS + 3 * 60_000;

describe("Dead-Letter Queue Explosion", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(deadLetterQueueExplosion.isFree).toBe(false);
      expect(deadLetterQueueExplosion.library?.category).toBe("Messaging & Streaming");
      expect(deadLetterQueueExplosion.library?.tags.length).toBeGreaterThan(0);
      expect(deadLetterQueueExplosion.library?.skills.length).toBeGreaterThan(0);
      expect(deadLetterQueueExplosion.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = DEAD_LETTER_QUEUE_EXPLOSION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DEAD_LETTER_QUEUE_EXPLOSION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(deadLetterQueueExplosionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(deadLetterQueueExplosionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(deadLetterQueueExplosionCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(deadLetterQueueExplosionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.dlqDepth).toBe(20);
      expect(state.values.dataLossState).toBe("intact");
      expect(state.values.eventsPermanentlyLost).toBe(0);
    });

    it("the schema issue triggers the DLQ-growing baseline incident", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(SCHEMA_ISSUE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.dlqGrowthRatePerMin).toBe(340);
      expect(state.values.duplicateProcessingRiskScore).toBe(58);
      expect(state.values.consumerStatus).toBe("critical");
    });

    it("strong path: parser fix + filtered replay + paced retry delay fully recovers and drains the backlog", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
      ]);
      expect(state.values.dlqGrowthRatePerMin).toBe(0);
      expect(state.values.duplicateProcessingRiskScore).toBe(2);
      expect(state.values.dataLossState).toBe("intact");
      expect(state.values.consumerStatus).toBe("normal");
    });

    it("acceptable path: parser fix + replay paused is safe but leaves the backlog undrained", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_PAUSED_KEY, value: true },
      ]);
      expect(state.values.dlqDepth).toBe(640);
      expect(state.values.dlqGrowthRatePerMin).toBe(0);
      expect(state.values.duplicateProcessingRiskScore).toBe(0);
      expect(state.values.dataLossState).toBe("intact");
    });

    it("harmful path: unfiltered fast replay raises duplicate-processing risk even after the parser is fixed", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "all" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 250 },
      ]);
      expect(state.values.duplicateProcessingRiskScore).toBe(78);
      expect(state.values.consumerStatus).toBe("warning");
      expect(state.values.dataLossState).toBe("intact");
    });

    it("harmful path: scaling consumers while the parser is broken fills the DLQ faster, not slower", () => {
      const baseline = runScenario(SCHEMA_ISSUE_MS + 20_000);
      const scaled = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: CONSUMER_INSTANCE_COUNT_KEY, value: 8 },
      ]);
      expect(scaled.values.dlqDepth).toBeGreaterThan(baseline.values.dlqDepth as number);
      expect(scaled.values.mainQueueLagMessages).toBeGreaterThan(
        baseline.values.mainQueueLagMessages as number,
      );
      expect(scaled.values.consumerStatus).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.consumerStatus).toBe("critical");
    });

    it("delayed consequence: the reprocessor's replay backlog catches up on a second wave, with a visible precursor already climbing", () => {
      const beforeSecondWave = runScenario(SCHEMA_ISSUE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.duplicateProcessingRiskScore).toBeGreaterThanOrEqual(50);
      expect(beforeSecondWave.values.replayThroughputPerMin).toBeGreaterThan(0);

      const afterSecondWave = runScenario(REPLAY_BACKLOG_CATCHUP_MS + 5_000);
      expect(afterSecondWave.values.duplicateProcessingRiskScore).toBe(92);
      expect(afterSecondWave.values.mainQueueLagMessages).toBe(1_400);
    });

    it("stays active (never auto-fails) even after main queue lag stays at or above 1200 past the old sustained window", () => {
      const state = runScenario(REPLAY_BACKLOG_CATCHUP_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        deadLetterQueueExplosionSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak DLQ depth and peak duplicate-processing risk generically via numericWatchFields", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 1_000);
      expect(state.peaks.peakValues.dlqDepth).toBe(3_400);
      expect(state.peaks.peakValues.duplicateProcessingRiskScore).toBe(58);
    });

    it("tracks monthly infrastructure cost that increases with consumer instance count", () => {
      let state = createInitialState(deadLetterQueueExplosionSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(220);

      state = simulate(
        deadLetterQueueExplosionSimulation,
        state,
        { id: "scale-consumers", timestampMs: 0, controlKey: CONSUMER_INSTANCE_COUNT_KEY, value: 16 },
        deadLetterQueueExplosionSimulation.tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(220 + 280);
    });

    describe("THE TRAP: discarding the DLQ is irreversible data loss, not a fix", () => {
      it("discarding the DLQ makes every operational metric look healthy", () => {
        const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
          { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: DLQ_ACTION_KEY, value: "discard" },
        ]);
        expect(state.values.dlqDepth).toBe(0);
        expect(state.values.dlqGrowthRatePerMin).toBe(0);
        expect(state.values.duplicateProcessingRiskScore).toBe(0);
        expect(state.values.consumerStatus).toBe("normal");
      });

      it("but the data loss is real: dataLossState flips and eventsPermanentlyLost becomes nonzero", () => {
        const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
          { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: DLQ_ACTION_KEY, value: "discard" },
        ]);
        expect(state.values.dataLossState).toBe("eventsPurged");
        expect(state.values.eventsPermanentlyLost).toBe(4_800);
      });

      it("the discarded-but-healthy-looking state does NOT satisfy successCondition", () => {
        const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
          { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: DLQ_ACTION_KEY, value: "discard" },
        ]);
        const eligibility = evaluateCompletionEligibility(deadLetterQueueExplosionSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
        expect(state.transitions.consecutiveSuccessSeconds).toBe(0);
        expect(state.transitions.consecutiveAcceptableSeconds).toBe(0);
      });

      it("Finish from the discarded-but-healthy-looking state -> declared_unstable, never a success tier", () => {
        const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
          { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: DLQ_ACTION_KEY, value: "discard" },
        ]);
        const result = evaluateCandidateDeclaredFinish(deadLetterQueueExplosionSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });

      it("discarding is classified as a harmful action regardless of how the control is left afterward", () => {
        let state = createInitialState(deadLetterQueueExplosionSimulation);
        state = simulate(
          deadLetterQueueExplosionSimulation,
          state,
          { id: "a1", timestampMs: SCHEMA_ISSUE_MS + 1_000, controlKey: DLQ_ACTION_KEY, value: "discard" },
          deadLetterQueueExplosionSimulation.tickMs,
        ).state;
        expect(state.numberOfHarmfulChanges).toBe(1);

        // Resetting the control back to "none" does not erase the
        // already-recorded harmful action — numberOfHarmfulChanges never
        // decrements, modeling the fact that the real-world purge already
        // happened and cannot be un-done by flipping a dropdown back.
        state = simulate(
          deadLetterQueueExplosionSimulation,
          state,
          { id: "a2", timestampMs: SCHEMA_ISSUE_MS + 2_000, controlKey: DLQ_ACTION_KEY, value: "none" },
          deadLetterQueueExplosionSimulation.tickMs,
        ).state;
        expect(state.numberOfHarmfulChanges).toBe(1);
      });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        deadLetterQueueExplosionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_PAUSED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        deadLetterQueueExplosionSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });
  });

  describe("Phase 6.1: two-tier completion — fixed+drained (optimal) vs fixed+paused (acceptable)", () => {
    it("parser fixed + filtered disciplined replay, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(deadLetterQueueExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("parser fixed + replay paused, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_PAUSED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(deadLetterQueueExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("unfiltered fast replay remains ineligible for any Finish tier", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "all" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 250 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(deadLetterQueueExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
      ]);
      const result = evaluateCandidateDeclaredFinish(deadLetterQueueExplosionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_PAUSED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(deadLetterQueueExplosionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(SCHEMA_ISSUE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(deadLetterQueueExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode; a sustained breach still declares unstable on Finish", () => {
      const state = runScenario(REPLAY_BACKLOG_CATCHUP_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(deadLetterQueueExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
      ];
      const runA = runScenario(SCHEMA_ISSUE_MS + 20_000, actions);
      const runB = runScenario(SCHEMA_ISSUE_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (fixed+drained), acceptable (fixed+paused), baseline, harmful, and the discard trap with coherent ordering", () => {
      const goodState = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_FAILURE_FILTER_KEY, value: "schemaOnly" },
        { atMs: SCHEMA_ISSUE_MS + 3_000, controlKey: RETRY_DELAY_MS_KEY, value: 1_000 },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(deadLetterQueueExplosionSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
        extractFinishScoringInputs(deadLetterQueueExplosionSimulation, goodFinish),
      );

      const acceptableState = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: PARSER_SCHEMA_COMPAT_MODE_KEY, value: true },
        { atMs: SCHEMA_ISSUE_MS + 2_000, controlKey: REPLAY_PAUSED_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        deadLetterQueueExplosionSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
        extractFinishScoringInputs(deadLetterQueueExplosionSimulation, acceptableFinish),
      );

      // Baseline/harmful/discard paths never reach Finish eligibility —
      // score them as never-resolved attempts via the unresolved
      // terminal override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(SCHEMA_ISSUE_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
        extractScoringInputs(deadLetterQueueExplosionSimulation, baselineState),
      );

      const harmfulState = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: CONSUMER_INSTANCE_COUNT_KEY, value: 8 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
        extractScoringInputs(deadLetterQueueExplosionSimulation, harmfulState),
      );

      // THE TRAP: discarding the DLQ. Every operational metric is clean
      // (same as the baseline's never-resolved scoring path structurally
      // — this attempt also never reaches Finish eligibility, per the
      // eligibility test above), but dataLossState="eventsPurged" must
      // tank Data Integrity specifically.
      const corruptButAvailableState = runScenario(SCHEMA_ISSUE_MS + 20_000, [
        { atMs: SCHEMA_ISSUE_MS + 1_000, controlKey: DLQ_ACTION_KEY, value: "discard" },
      ]);
      const corruptButAvailableScore = scoreAuthoredAttempt(
        DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
        extractScoringInputs(deadLetterQueueExplosionSimulation, corruptButAvailableState),
      );

      // NOTE (section 16/17 suspicious-tie investigation): goodScore and
      // acceptableScore legitimately tie at 865 here — both mitigations
      // are applied within the first few ticks of incident start in this
      // test, so recovery/customerImpact/reliability recover equally
      // fast for both, and dataIntegrity is 200 for both since neither
      // path ever touches dataLossState (both are "intact"). This is the
      // CORRECT behavior: good vs. acceptable differ in whether the DLQ
      // backlog is actually drained (dlqDepth), not in data integrity —
      // acceptable's "safe but incomplete" status is an operational
      // completeness distinction, never a correctness violation. Data
      // Integrity's entire job in this scenario is to separate the
      // discard trap from every other path, which it does below.
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(865);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      expect(corruptButAvailableScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);

      // The critical assertion for this batch: Data Integrity must be
      // measurably lower for the corrupt-but-available state than for
      // the genuinely optimal state, even though its other operational
      // metrics look at least as healthy (indeed customerImpact and
      // costEfficiency score equal-or-better for the corrupt state,
      // which is exactly why Data Integrity must be the dimension that
      // catches it).
      expect(corruptButAvailableScore.breakdown.dataIntegrity).toBe(15);
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(200);
      expect(corruptButAvailableScore.breakdown.dataIntegrity).toBeLessThan(
        goodScore.breakdown.dataIntegrity,
      );
      expect(corruptButAvailableScore.breakdown.dataIntegrity).toBeLessThan(
        acceptableScore.breakdown.dataIntegrity,
      );
      expect(corruptButAvailableScore.breakdown.dataIntegrity).toBeLessThan(
        baselineScore.breakdown.dataIntegrity,
      );
    });
  });
});
