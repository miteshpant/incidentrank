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
import { largePayloadRegression } from "./large-payload-regression";
import {
  API_INSTANCE_COUNT_KEY,
  COMPRESSION_ENABLED_KEY,
  largePayloadRegressionSimulation,
  PAGE_SIZE_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  RESPONSE_PROJECTION_ENABLED_KEY,
} from "./large-payload-regression/definition";
import { largePayloadRegressionCandidateUI } from "./large-payload-regression/candidate-ui";
import { LARGE_PAYLOAD_REGRESSION_SCORING } from "./large-payload-regression/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(largePayloadRegressionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += largePayloadRegressionSimulation.tickMs
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
      largePayloadRegressionSimulation,
      state,
      action,
      largePayloadRegressionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const REGRESSION_DEPLOYED_MS = 30_000;
const MEMORY_EXHAUSTION_MS = REGRESSION_DEPLOYED_MS + 3 * 60_000;

describe("Large Payload Regression", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(largePayloadRegression.isFree).toBe(false);
      expect(largePayloadRegression.library?.category).toBe("API & Traffic");
      expect(largePayloadRegression.library?.tags.length).toBeGreaterThan(0);
      expect(largePayloadRegression.library?.skills.length).toBeGreaterThan(0);
      expect(largePayloadRegression.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = LARGE_PAYLOAD_REGRESSION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = LARGE_PAYLOAD_REGRESSION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(largePayloadRegressionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(largePayloadRegressionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(largePayloadRegressionCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(largePayloadRegressionCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(largePayloadRegressionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.apiMemoryUtilization).toBe(22);
      expect(state.values.payloadShapeHealth).toBe("unresolved");
    });

    it("the payload regression deploy triggers the bloated baseline incident", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REGRESSION_DEPLOYED_MS);
      expect(state.status).toBe("critical");
      expect(state.values.responsePayloadSizeKb).toBe(480);
      expect(state.values.apiMemoryUtilization).toBe(85);
      expect(state.values.apiStatus).toBe("critical");
    });

    it("strong path: response projection resolves payload size, latency, memory, and network together", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_PROJECTION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.responsePayloadSizeKb).toBe(20);
      expect(state.values.apiMemoryUtilization).toBe(24);
      expect(state.values.networkUtilizationMbps).toBe(45);
      expect(state.values.payloadShapeHealth).toBe("shape-fixed");
      expect(state.values.apiStatus).toBe("normal");
    });

    it("alternate good path: a small page size also genuinely fixes the shape", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAGE_SIZE_KEY, value: 25 },
      ]);
      expect(state.values.responsePayloadSizeKb).toBe(34);
      expect(state.values.payloadShapeHealth).toBe("shape-fixed");
      expect(state.values.apiStatus).toBe("normal");
    });

    it("required property: scaling API instances alone reduces per-instance memory but leaves payload size and network unchanged", () => {
      const baseline = runScenario(REGRESSION_DEPLOYED_MS + 20_000);
      const scaled = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);

      // Payload size and network utilization: exactly unchanged — each
      // request is still exactly as expensive.
      expect(scaled.values.responsePayloadSizeKb).toBe(baseline.values.responsePayloadSizeKb);
      expect(scaled.values.networkUtilizationMbps).toBe(baseline.values.networkUtilizationMbps);
      // Memory: genuinely lower than baseline (spread across more
      // instances) but still far from healthy, and status stays critical.
      expect(scaled.values.apiMemoryUtilization).toBeLessThan(
        baseline.values.apiMemoryUtilization as number,
      );
      expect(scaled.values.apiMemoryUtilization).toBeGreaterThan(35);
      expect(scaled.values.apiStatus).toBe("critical");
      expect(scaled.values.payloadShapeHealth).toBe("unresolved");
    });

    it("harmful path: a tightened payload size limit silently truncates and raises the error rate instead of fixing anything", () => {
      const baseline = runScenario(REGRESSION_DEPLOYED_MS + 20_000);
      const truncated = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAYLOAD_SIZE_LIMIT_KEY, value: "512kb" },
      ]);

      expect(truncated.values.apiMemoryUtilization).toBeLessThan(35);
      expect(truncated.values.apiStatus).not.toBe("critical");
      expect(truncated.values.payloadShapeHealth).toBe("feature-limited");
      // Despite memory/latency looking healthy, error rate is WORSE than
      // the unmitigated baseline — this is a correctness trap, not relief.
      expect(truncated.values.errorRatePercent).toBeGreaterThan(
        baseline.values.errorRatePercent as number,
      );
      expect(truncated.values.errorRatePercent).toBe(22);
    });

    it("harmful path: tightening the limit further raises the error rate even more", () => {
      const limit512 = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAYLOAD_SIZE_LIMIT_KEY, value: "512kb" },
      ]);
      const limit128 = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAYLOAD_SIZE_LIMIT_KEY, value: "128kb" },
      ]);
      expect(limit128.values.errorRatePercent).toBeGreaterThan(
        limit512.values.errorRatePercent as number,
      );
    });

    it("partial path: compression reduces network utilization and latency but not memory or shape health", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: COMPRESSION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.networkUtilizationMbps).toBe(95);
      expect(state.values.apiMemoryUtilization).toBe(80);
      expect(state.values.payloadShapeHealth).toBe("unresolved");
      expect(state.status).not.toBe("resolved");
    });

    it("partial path: response caching gives incomplete relief under highly variable per-account data", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_CACHE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.apiMemoryUtilization).toBe(88);
      expect(state.values.apiStatus).toBe("critical");
      expect(state.values.payloadShapeHealth).toBe("unresolved");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.apiStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated load exhausts API memory on a second wave, with a visible precursor", () => {
      const beforeSecondWave = runScenario(REGRESSION_DEPLOYED_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.apiMemoryUtilization).toBeGreaterThanOrEqual(85);
      expect(beforeSecondWave.values.p99LatencyMs).toBeGreaterThan(1_000);

      const afterSecondWave = runScenario(MEMORY_EXHAUSTION_MS + 5_000);
      expect(afterSecondWave.values.apiMemoryUtilization).toBe(97);
      expect(afterSecondWave.values.errorRatePercent).toBe(14);
    });

    it("fails if API memory stays at or above 95% for the full sustained window", () => {
      const state = runScenario(MEMORY_EXHAUSTION_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak memory and peak payload size generically via numericWatchFields", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 1_000);
      expect(state.peaks.peakValues.apiMemoryUtilization).toBe(85);
      expect(state.peaks.peakValues.responsePayloadSizeKb).toBe(480);
    });

    it("tracks monthly infrastructure cost that increases with API instance count", () => {
      let state = createInitialState(largePayloadRegressionSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(420);

      const tickMs = largePayloadRegressionSimulation.tickMs;
      state = simulate(
        largePayloadRegressionSimulation,
        state,
        { id: "scale-api", timestampMs: 0, controlKey: API_INSTANCE_COUNT_KEY, value: 32 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(420 + 1_180);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("zero-action Finish at t=0 (before the incident starts) does not resolve — payloadShapeHealth is still unresolved", () => {
      const state = createInitialState(largePayloadRegressionSimulation);
      expect(state.values.apiMemoryUtilization).toBe(22);
      expect(state.values.apiStatus).toBe("normal");
      // Two of three successCondition checks already pass at t=0, but
      // payloadShapeHealth never does, so Finish must still be ineligible.
      const eligibility = evaluateCompletionEligibility(largePayloadRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });

      const result = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("zero-action Finish immediately after the regression deploys also does not resolve", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 1_000);
      const result = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Phase 6.1: candidate-declared completion, no acceptable tier", () => {
    it("response projection, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_PROJECTION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(largePayloadRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("small page size, sustained, is also eligible for an OPTIMAL-tier Finish (alternate good path)", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAGE_SIZE_KEY, value: 25 },
      ]);
      const eligibility = evaluateCompletionEligibility(largePayloadRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("truncation via payload size limit never becomes eligible for any Finish tier, however long it is sustained", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 90_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAYLOAD_SIZE_LIMIT_KEY, value: "512kb" },
      ]);
      const eligibility = evaluateCompletionEligibility(largePayloadRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("scaling instances alone never becomes eligible for any Finish tier", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 90_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 32 },
      ]);
      const eligibility = evaluateCompletionEligibility(largePayloadRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_PROJECTION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        largePayloadRegressionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal (projection) -> resolved/optimal", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_PROJECTION_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 40_000);
      const result = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the truncation trap -> declared_unstable, never resolved", () => {
      const state = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAYLOAD_SIZE_LIMIT_KEY, value: "128kb" },
      ]);
      const result = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(MEMORY_EXHAUSTION_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_PROJECTION_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(REGRESSION_DEPLOYED_MS + 20_000, actions);
      const runB = runScenario(REGRESSION_DEPLOYED_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical events and score for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAGE_SIZE_KEY, value: 25 },
      ];
      const stateA = runScenario(REGRESSION_DEPLOYED_MS + 40_000, actions);
      const stateB = runScenario(REGRESSION_DEPLOYED_MS + 40_000, actions);
      const finishA = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, stateA);
      const finishB = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, stateB);
      const scoreA = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractFinishScoringInputs(largePayloadRegressionSimulation, finishA),
      );
      const scoreB = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractFinishScoringInputs(largePayloadRegressionSimulation, finishB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores good (projection), alternate-good (pagination), baseline, and harmful (scaled/truncated) paths with coherent ordering", () => {
      const goodState = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: RESPONSE_PROJECTION_ENABLED_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractFinishScoringInputs(largePayloadRegressionSimulation, goodFinish),
      );

      const altGoodState = runScenario(REGRESSION_DEPLOYED_MS + 40_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAGE_SIZE_KEY, value: 25 },
      ]);
      const altGoodFinish = evaluateCandidateDeclaredFinish(largePayloadRegressionSimulation, altGoodState);
      const altGoodScore = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractFinishScoringInputs(largePayloadRegressionSimulation, altGoodFinish),
      );

      // Baseline/harmful/truncation paths never reach Finish eligibility
      // — score them as never-resolved attempts via the unresolved
      // terminal override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(REGRESSION_DEPLOYED_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractScoringInputs(largePayloadRegressionSimulation, baselineState),
      );

      const scaledState = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);
      const scaledScore = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractScoringInputs(largePayloadRegressionSimulation, scaledState),
      );

      const truncatedState = runScenario(REGRESSION_DEPLOYED_MS + 20_000, [
        { atMs: REGRESSION_DEPLOYED_MS + 1_000, controlKey: PAYLOAD_SIZE_LIMIT_KEY, value: "128kb" },
      ]);
      const truncatedScore = scoreAuthoredAttempt(
        LARGE_PAYLOAD_REGRESSION_SCORING,
        extractScoringInputs(largePayloadRegressionSimulation, truncatedState),
      );

      // Real executed totals (packages/scenarios/src/__debug-score run):
      // both optimal paths legitimately tie at 865 — projection and
      // small-page-size are applied at the same elapsed time in these
      // fixtures, so recovery/customerImpact/reliability/dataIntegrity
      // all land identically; this mirrors Missing Database Index's own
      // documented optimal-vs-optimal tie and is not a scoring defect.
      expect(goodScore.total).toBe(865);
      expect(altGoodScore.total).toBe(865);
      expect(baselineScore.total).toBe(550);
      expect(scaledScore.total).toBe(460);
      expect(scaledScore.total).toBeLessThan(baselineScore.total);
      // Truncation's dataIntegrity penalty (feature-limited) must drive
      // its score below even the plain unmitigated baseline, despite
      // "healthier"-looking memory/latency numbers — otherwise the
      // scorer would be rewarding the correctness trap.
      expect(truncatedScore.total).toBe(375);
      expect(truncatedScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(altGoodScore.total).toBeGreaterThan(baselineScore.total);
    });
  });
});
