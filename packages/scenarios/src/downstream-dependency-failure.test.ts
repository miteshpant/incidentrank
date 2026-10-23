import { createInitialState, extractScoringInputs, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { downstreamDependencyFailure } from "./downstream-dependency-failure";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  downstreamDependencyFailureSimulation,
  FALLBACK_RESPONSE_ENABLED_KEY,
  REQUEST_TIMEOUT_MS_KEY,
} from "./downstream-dependency-failure/definition";
import { DOWNSTREAM_DEPENDENCY_FAILURE_SCORING } from "./downstream-dependency-failure/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(downstreamDependencyFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += downstreamDependencyFailureSimulation.tickMs
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
      downstreamDependencyFailureSimulation,
      state,
      action,
      downstreamDependencyFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Downstream Dependency Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(downstreamDependencyFailure.isFree).toBe(false);
    expect(downstreamDependencyFailure.library?.category).toBe("Microservices & Dependencies");
    expect(downstreamDependencyFailure.library?.tags.length).toBeGreaterThan(0);
    expect(downstreamDependencyFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(downstreamDependencyFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.callingServiceThreadPoolUtilization).toBe(20);
    expect(state.values.callingServiceStatus).toBe("normal");
  });

  it("exhausts calling-service capacity critically when the downstream fails with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.callingServiceThreadPoolUtilization).toBe(92);
    expect(state.values.callingServiceStatus).toBe("critical");
  });

  it("recovers cleanly when the circuit breaker is enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CIRCUIT_BREAKER_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.callingServiceThreadPoolUtilization).toBe(25);
  });

  it("lengthening the request timeout without the circuit breaker is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithLongTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: REQUEST_TIMEOUT_MS_KEY, value: 20_000 },
    ]);

    expect(stateWithLongTimeout.values.callingServiceThreadPoolUtilization).toBeGreaterThan(
      stateWithoutMitigation.values.callingServiceThreadPoolUtilization as number,
    );
    expect(stateWithLongTimeout.values.callingServiceStatus).toBe("critical");
  });

  it("shortening the request timeout alone (no circuit breaker) is a partial improvement, not a full fix", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: REQUEST_TIMEOUT_MS_KEY, value: 500 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.callingServiceStatus).toBe("warning");
    expect(state.values.queuedRequests).toBe(180);
  });

  it("fails if the request queue stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak queued requests generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.queuedRequests).toBe(450);
  });

  it("tracks monthly infrastructure cost that increases when the fallback response path is enabled", () => {
    let state = createInitialState(downstreamDependencyFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(90);

    const tickMs = downstreamDependencyFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "enable-fallback",
      timestampMs: 0,
      controlKey: FALLBACK_RESPONSE_ENABLED_KEY,
      value: true,
    };
    state = simulate(downstreamDependencyFailureSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(130);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CIRCUIT_BREAKER_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: FALLBACK_RESPONSE_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring", () => {
    // This scenario has no completion mode override (see definition.ts),
    // so it defaults to "automatic" (runtime-view.ts) — the engine itself
    // writes resolvedAtMs/failedAtMs via tick.ts, and a plain
    // extractScoringInputs(simulation, state) call (no
    // evaluateCandidateDeclaredFinish/extractFinishScoringInputs) is the
    // correct, simpler extraction path.
    //
    // Sequences below are grounded directly in rules.ts: opening the
    // circuit breaker reaches "circuit-breaker-recovery" (status
    // "normal", thread pool 25% <= 40%, failedRequestRate 1 < 5 ->
    // satisfies successCondition and sustains to "resolved"). Doing
    // nothing hits "exhaustion-critical-default" (queuedRequests 450 >=
    // 400 failureCondition threshold, sustained 60s -> "failed").
    // Lengthening the timeout past 20_000ms with the breaker still off
    // hits the authored "long-timeout-no-breaker-harmful" rule (explicit
    // trap: queuedRequests 620, thread pool 99%, worse than doing
    // nothing) and is also flagged `outcome: "harmful"` in
    // action-classifications.ts. Shortening the timeout alone (<=500ms,
    // breaker still off) hits "short-timeout-no-breaker-partial" (status
    // "degraded", queuedRequests 180 — below the 400 failure threshold,
    // so it never fails, but never satisfies successCondition either
    // since failedRequestRate stays at 30 >= 5).
    const UNTIL_RESOLVED_MS = 60_000;
    const UNTIL_FAILED_MS = 30_000 + 61_000;

    function scoreFor(state: ReturnType<typeof runScenario>) {
      const inputs = extractScoringInputs(downstreamDependencyFailureSimulation, state);
      return scoreAuthoredAttempt(DOWNSTREAM_DEPENDENCY_FAILURE_SCORING, inputs).total;
    }

    it("scores a full circuit-breaker recovery strictly above doing nothing and above the harmful long-timeout trap", () => {
      const goodState = runScenario(UNTIL_RESOLVED_MS, [
        { atMs: 31_000, controlKey: CIRCUIT_BREAKER_ENABLED_KEY, value: true },
      ]);
      expect(goodState.status).toBe("resolved");

      const baselineState = runScenario(UNTIL_FAILED_MS);
      expect(baselineState.status).toBe("failed");

      const harmfulState = runScenario(UNTIL_FAILED_MS, [
        { atMs: 31_000, controlKey: REQUEST_TIMEOUT_MS_KEY, value: 20_000 },
      ]);
      expect(harmfulState.status).toBe("failed");

      const goodScore = scoreFor(goodState);
      const baselineScore = scoreFor(baselineState);
      const harmfulScore = scoreFor(harmfulState);

      // Resolving via the authored fix (circuit breaker) earns full
      // recovery(300) + reliability(150) credit that terminalOverrides
      // zeroes out for every non-resolved outcome, so a genuine recovery
      // must clearly outscore either failure path.
      expect(goodScore).toBeGreaterThan(baselineScore);
      expect(goodScore).toBeGreaterThan(harmfulScore);

      // Lengthening the timeout with the breaker off is the scenario's
      // authored trap (action-classifications.ts marks it "harmful", and
      // rules.ts's long-timeout-no-breaker-harmful pins thread-pool
      // utilization to 99% and queuedRequests to 620 — worse than the
      // 92%/450 baseline-critical default). Both sequences run out the
      // clock to the same "failed" outcome, but the trap still costs
      // operationalEfficiency's harmfulChangeCount penalty (-15), so it
      // must never score at or above doing nothing.
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });

    it("scores the partial short-timeout mitigation no worse than doing nothing, even though neither resolves", () => {
      const partialState = runScenario(90_000, [
        { atMs: 31_000, controlKey: REQUEST_TIMEOUT_MS_KEY, value: 500 },
      ]);
      expect(partialState.status).toBe("degraded");
      expect(partialState.status).not.toBe("resolved");
      expect(partialState.status).not.toBe("failed");

      const baselineState = runScenario(UNTIL_FAILED_MS);
      expect(baselineState.status).toBe("failed");

      const partialScore = scoreFor(partialState);
      const baselineScore = scoreFor(baselineState);

      // Shortening the timeout alone visibly reduces live harm (revenue
      // loss ~$131 vs. ~$413, and 2s vs. 62s spent in a critical state,
      // measured directly off customerImpact), but recovery and
      // reliability are both zeroed by terminalOverrides for every
      // non-resolved outcome ("degraded" and "failed" alike), and the
      // reduced revenue loss still lands in the same <=$5,000
      // customerImpact band as the baseline's ~$413 loss. The two
      // sequences are therefore genuinely tied at the total-score level
      // for this scenario's authored bands — asserting strict
      // improvement here would not be true of the real scorer.
      expect(partialScore).toBeGreaterThanOrEqual(baselineScore);
    });
  });
});
