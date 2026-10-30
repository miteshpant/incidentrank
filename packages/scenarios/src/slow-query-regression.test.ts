import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { slowQueryRegression } from "./slow-query-regression";
import {
  CONNECTION_POOL_SIZE_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  QUERY_TIMEOUT_MS_KEY,
  slowQueryRegressionSimulation,
} from "./slow-query-regression/definition";
import { SLOW_QUERY_REGRESSION_SCORING } from "./slow-query-regression/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(slowQueryRegressionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += slowQueryRegressionSimulation.tickMs
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
      slowQueryRegressionSimulation,
      state,
      action,
      slowQueryRegressionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Slow Query Regression", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(slowQueryRegression.isFree).toBe(false);
    expect(slowQueryRegression.library?.category).toBe("Databases & Storage");
    expect(slowQueryRegression.library?.tags.length).toBeGreaterThan(0);
    expect(slowQueryRegression.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(slowQueryRegressionSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.cpuUtilization).toBe(15);
    expect(state.values.queryStatus).toBe("normal");
  });

  it("regresses critically when the trigger fires with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.cpuUtilization).toBe(95);
    expect(state.values.queryStatus).toBe("critical");
  });

  it("recovers cleanly when the index hint is forced", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.cpuUtilization).toBe(18);
    expect(evaluateCandidateDeclaredFinish(slowQueryRegressionSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("scaling the connection pool without the index hint is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithPoolScaling = runScenario(35_000, [
      { atMs: 31_000, controlKey: CONNECTION_POOL_SIZE_KEY, value: 100 },
    ]);

    expect(stateWithPoolScaling.values.cpuUtilization).toBeGreaterThan(
      stateWithoutMitigation.values.cpuUtilization as number,
    );
    expect(stateWithPoolScaling.values.queryStatus).toBe("critical");
  });

  it("an aggressive timeout masks the symptom but never resolves the regression", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 1_000 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.queryStatus).toBe("warning");
    expect(state.values.cpuUtilization).toBe(70);
  });

  it("stays active (never auto-fails) even after CPU utilization remains critical past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      slowQueryRegressionSimulation.failureCondition.sustainedSeconds,
    );
  });

  it("tracks peak CPU utilization generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.cpuUtilization).toBe(95);
  });

  it("tracks monthly infrastructure cost that increases with connection pool size", () => {
    let state = createInitialState(slowQueryRegressionSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(140);

    const tickMs = slowQueryRegressionSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-pool",
      timestampMs: 0,
      controlKey: CONNECTION_POOL_SIZE_KEY,
      value: 200,
    };
    state = simulate(slowQueryRegressionSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(520);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 5_000 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring path", () => {
    // The engine itself never auto-writes resolvedAtMs (Phase 7.1
    // doctrine) — score a genuinely-resolvable run via its Finish
    // declaration; every other (unresolved/failed) run still scores
    // correctly via a raw extractScoringInputs call.
    //
    // Trigger fires at 30_000ms (see "regresses critically..." above).
    // failureCondition needs 60s sustained cpuUtilization>=90, which first
    // becomes true once the critical/harmful rule values apply, so the
    // earliest a sustained-failure completes is ~91_000ms. 85_000ms keeps
    // every non-resolving sequence in the "unresolved" bucket (not
    // "failed") for a fair, apples-to-apples comparison against each
    // other, while the good sequence is independently resolved by then.
    const UNTIL_MS = 85_000;

    function scoreFor(actions: TimedAction[]) {
      const state = runScenario(UNTIL_MS, actions);
      const finishResult = evaluateCandidateDeclaredFinish(slowQueryRegressionSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(slowQueryRegressionSimulation, finishResult)
          : extractScoringInputs(slowQueryRegressionSimulation, state);
      return scoreAuthoredAttempt(SLOW_QUERY_REGRESSION_SCORING, inputs).total;
    }

    it("scores the full index-hint recovery as a near-perfect run", () => {
      const state = runScenario(UNTIL_MS, [
        { atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");

      const finishResult = evaluateCandidateDeclaredFinish(slowQueryRegressionSimulation, state);
      expect(finishResult.outcome).toBe("resolved");
      const inputs = extractFinishScoringInputs(slowQueryRegressionSimulation, finishResult);
      const result = scoreAuthoredAttempt(SLOW_QUERY_REGRESSION_SCORING, inputs);
      // 865, not a perfect 1000: deriveScoringResolvedAtMs credits the
      // INSTANT the success condition first became continuously true
      // (1s after incident start), not the moment its sustain window
      // finished — recoveryTimeSeconds is excellent (top band, 300/300),
      // but totalTimeInCriticalMs (accumulated before the fix took
      // effect) measured against that same short resolved window drives
      // criticalTimeRatio to the worst reliability band (15/150). Same
      // mechanism as autoscaling-failure.test.ts's equivalent note.
      expect(result.total).toBe(865);
    });

    it("ranks good recovery above doing nothing, doing nothing above the masking timeout, and the masking timeout above the harmful pool-scaling trap", () => {
      // good: forcing the index hint resolves the regression outright
      // (rules.ts "index-hint-recovery") well before UNTIL_MS.
      const goodScore = scoreFor([
        { atMs: 31_000, controlKey: FORCE_INDEX_HINT_ENABLED_KEY, value: true },
      ]);

      // baseline: no action at all — "regression-critical-default"
      // (cpuUtilization 95), still unresolved at UNTIL_MS.
      const baselineScore = scoreFor([]);

      // harmful: scaling the connection pool to >=100 while the index
      // hint stays off hits "pool-scaled-without-index-hint-harmful"
      // (cpuUtilization 98, queryStatus critical) — explicitly classified
      // "harmful" in action-classifications.ts, and also the costliest
      // infrastructure change of the three (pool 100 raises monthly cost,
      // crushing costEfficiency on top of the operationalEfficiency
      // harmfulChangeCount penalty).
      const harmfulScore = scoreFor([
        { atMs: 31_000, controlKey: CONNECTION_POOL_SIZE_KEY, value: 100 },
      ]);

      // masking partial: an aggressive queryTimeoutMs<=1000 hits
      // "aggressive-timeout-masks-symptom" (cpuUtilization 70,
      // queryStatus "warning") — queued queries stay low so the
      // dashboard looks contained, but the regression itself is never
      // fixed. This action is also classified "harmful" in
      // action-classifications.ts (it carries its own
      // harmfulChangeCount penalty), but unlike pool-scaling it carries
      // no infrastructure cost increase, and its resulting cpuUtilization
      // (70) never approaches the failureCondition threshold (90).
      const maskedPartialScore = scoreFor([
        { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 1_000 },
      ]);

      // Real, verified ordering (not an assumed universal pattern): the
      // masking partial scores BELOW doing nothing, because it is itself
      // an authored-harmful action (operationalEfficiency penalty) even
      // though its surface metrics look calmer than the untouched
      // baseline. And it still beats the pool-scaling trap because that
      // trap additionally wrecks costEfficiency via a real infrastructure
      // cost increase.
      expect(goodScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(maskedPartialScore);
      expect(maskedPartialScore).toBeGreaterThan(harmfulScore);
    });
  });
});
