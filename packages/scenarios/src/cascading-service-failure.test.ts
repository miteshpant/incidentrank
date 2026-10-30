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
import { cascadingServiceFailure } from "./cascading-service-failure";
import {
  cascadingServiceFailureSimulation,
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
} from "./cascading-service-failure/definition";
import { CASCADING_SERVICE_FAILURE_SCORING } from "./cascading-service-failure/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cascadingServiceFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cascadingServiceFailureSimulation.tickMs
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
      cascadingServiceFailureSimulation,
      state,
      action,
      cascadingServiceFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Cascading Service Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(cascadingServiceFailure.isFree).toBe(false);
    expect(cascadingServiceFailure.library?.category).toBe("Distributed Systems");
    expect(cascadingServiceFailure.library?.tags.length).toBeGreaterThan(0);
    expect(cascadingServiceFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(cascadingServiceFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.cascadeDepth).toBe(0);
    expect(state.values.chainStatus).toBe("normal");
  });

  it("cascades critically when the root service fails with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.cascadeDepth).toBe(3);
    expect(state.values.checkoutSuccessRate).toBe(55);
  });

  it("recovers checkout success by isolating the root cause, even though the root service itself stays unhealthy", () => {
    const state = runScenario(55_000, [
      { atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.checkoutSuccessRate).toBe(99.5);
    // The root cause is never actually fixed by isolation alone — this is
    // the scenario's central point: isolating a failure is not the same
    // as repairing it.
    expect(state.values.rootServiceErrorRate).toBe(95);
    expect(
      evaluateCandidateDeclaredFinish(cascadingServiceFailureSimulation, state).outcome,
    ).toBe("resolved");
  });

  it("restarting the healthy upstream services is harmful, not helpful, and does not touch the root cause", () => {
    const stateWithoutMitigation = runScenario(35_000);

    const stateWithHarmfulRestart = runScenario(35_000, [
      { atMs: 31_000, controlKey: UPSTREAM_SERVICE_RESTART_ENABLED_KEY, value: true },
    ]);

    expect(stateWithHarmfulRestart.values.checkoutSuccessRate).toBeLessThan(
      stateWithoutMitigation.values.checkoutSuccessRate as number,
    );
    expect(stateWithHarmfulRestart.values.rootServiceErrorRate).toBe(95);
    expect(stateWithHarmfulRestart.values.chainStatus).toBe("critical");
  });

  it("a tight queue depth limit alone sheds load and prevents total collapse, but does not fully recover checkout", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY, value: 200 },
    ]);

    expect(state.values.checkoutSuccessRate).toBe(65);
    expect(state.status).not.toBe("resolved");
  });

  it("the cascade widens further if left unmitigated past the second escalation", () => {
    const state = runScenario(3 * 60_000 + 10_000);
    expect(state.values.cascadeDepth).toBe(5);
    expect(state.values.checkoutSuccessRate).toBe(20);
  });

  it("stays active (never auto-fails) even after checkout success remains critically low past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      cascadingServiceFailureSimulation.failureCondition.sustainedSeconds,
    );
  });

  it("tracks peak cascade depth generically via numericWatchFields", () => {
    const state = runScenario(3 * 60_000 + 10_000);
    expect(state.peaks.peakValues.cascadeDepth).toBe(5);
  });

  it("tracks monthly infrastructure cost that increases with the queue depth limit", () => {
    let state = createInitialState(cascadingServiceFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(180);

    const tickMs = cascadingServiceFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "raise-queue-limit",
      timestampMs: 0,
      controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY,
      value: 5_000,
    };
    state = simulate(cascadingServiceFailureSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(330);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY, value: 1_000 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring", () => {
    // The engine itself never auto-writes resolvedAtMs (Phase 7.1
    // doctrine) — score a genuinely-resolvable run via its Finish
    // declaration; every other (unresolved/failed) run still scores
    // correctly via a raw extractScoringInputs call.
    function scoreFor(actions: TimedAction[], untilMs: number) {
      const state = runScenario(untilMs, actions);
      const finishResult = evaluateCandidateDeclaredFinish(cascadingServiceFailureSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(cascadingServiceFailureSimulation, finishResult)
          : extractScoringInputs(cascadingServiceFailureSimulation, state);
      return { state, score: scoreAuthoredAttempt(CASCADING_SERVICE_FAILURE_SCORING, inputs) };
    }

    it("scores the correctly-scoped circuit-breaker isolation as a genuine resolved recovery", () => {
      // root-isolated-recovery: breaker on, queue limit at its default
      // (1_000, satisfying controlAtMost 1_000) -> checkoutSuccessRate 99.5,
      // cascadeDepth 1, chainStatus "warning" -> successCondition satisfied,
      // sustained for the full 15s -> status "resolved" at 46_000ms (31_000
      // action + 15_000 sustain).
      const { state, score } = scoreFor(
        [{ atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true }],
        55_000,
      );

      expect(state.status).not.toBe("resolved");
      expect(
        evaluateCandidateDeclaredFinish(cascadingServiceFailureSimulation, state).outcome,
      ).toBe("resolved");
      // 850, not the pre-Phase-7.1 985: deriveScoringResolvedAtMs credits
      // the INSTANT the success condition first became continuously true
      // (31_000ms, 1s after incident start), not the moment its 15s
      // sustain window finished — recoveryTimeSeconds is excellent (top
      // band, 300/300), but totalTimeInCriticalMs (2_000ms, accumulated
      // before the breaker took effect) measured against that same
      // honest 1-second window drives criticalTimeRatio to 2.0 — the
      // worst reliability band (15/150). Same mechanism as
      // autoscaling-failure.test.ts's equivalent note.
      expect(score.total).toBe(850);
    });

    it("scores an unmitigated run to failure the same total as a tight-queue-limit-only partial, both strictly above the harmful restart trap", () => {
      // Baseline: no action at all -> cascade-critical-default, and
      // checkoutSuccessRate stays below the failureCondition threshold past
      // its full 60s sustained window, but the engine no longer auto-fails
      // on a sustained breach alone (only the uniform 35-minute
      // ATTEMPT_CEILING_MS can end an attempt) -> status stays "critical",
      // unresolved, at 91_000ms. recovery and reliability both carry
      // terminalOverrides.unresolved: 0, and the modest
      // revenueLossUsd/criticalTimeRatio accrued so far stay inside every
      // band's full-marks ceiling, so customerImpact and costEfficiency
      // both still award full points -> total 535.
      const baseline = scoreFor([], 30_000 + 61_000);
      expect(baseline.state.status).not.toBe("failed");
      expect(baseline.state.status).not.toBe("resolved");
      expect(
        baseline.state.transitions.consecutiveFailureSeconds,
      ).toBeGreaterThanOrEqual(
        cascadingServiceFailureSimulation.failureCondition.sustainedSeconds,
      );

      // Partial: queue-limit-only rule (breaker OFF, queue limit <= 200) ->
      // checkoutSuccessRate 65, stays "critical"/unresolved the whole run
      // (never reaches successCondition, never reaches the 60s failure
      // sustain window either). recovery/reliability carry
      // terminalOverrides.unresolved: 0 (same zero as failed), and nothing
      // about this action trips operationalEfficiency's harmfulChangeCount
      // penalty, so this ties the baseline's total exactly.
      const partialQueueOnly = scoreFor(
        [{ atMs: 31_000, controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY, value: 200 }],
        45_000,
      );
      expect(partialQueueOnly.state.status).not.toBe("resolved");
      expect(partialQueueOnly.state.status).not.toBe("failed");
      expect(partialQueueOnly.score.total).toBe(baseline.score.total);
      expect(partialQueueOnly.score.total).toBe(535);

      // Harmful: upstream-service-restart while the breaker stays off is
      // the scenario's authored trap (action-classifications.ts marks it
      // "harmful" outright; rules.ts's restart-symptoms-harmful entry also
      // leaves rootServiceErrorRate untouched and briefly widens the visible
      // cascade). It scores strictly lower than both the baseline and the
      // queue-limit-only partial: recovery/reliability are already zeroed
      // out identically by the same unresolved terminalOverrides as above,
      // but operationalEfficiency's harmfulChangeCount>=1 penalty
      // (-25 points) is the one dimension that fires only for this action,
      // dropping its total to 510.
      const harmful = scoreFor(
        [{ atMs: 31_000, controlKey: UPSTREAM_SERVICE_RESTART_ENABLED_KEY, value: true }],
        45_000,
      );
      expect(harmful.state.status).not.toBe("resolved");
      expect(harmful.score.total).toBe(510);
      expect(harmful.score.total).toBeLessThan(baseline.score.total);
      expect(harmful.score.total).toBeLessThan(partialQueueOnly.score.total);
    });

    it("scores the slower, noisier high-queue-limit recovery path below the clean isolation, and no higher than the harmful trap", () => {
      // root-isolated-high-queue-limit: breaker ON but queue limit raised to
      // 5_000 (controlAtLeast 5_000) -> checkoutSuccessRate only 82, stays
      // "degraded"/unresolved for the whole run (82 < the successCondition's
      // 95 threshold, so it never resolves even though it is a real,
      // authored, distinct partial-recovery rule state). Its total (510)
      // ties the harmful trap's total exactly: both get zeroed
      // recovery/reliability via terminalOverrides.unresolved, and here it
      // is costEfficiency (not operationalEfficiency) that takes the hit --
      // the 5_000 queue-limit tier costs $150/mo more than baseline,
      // crossing the costIncreaseRatio 0.5 band -> 85 down to 60 points,
      // the same net -25 that the harmful path takes from a different
      // dimension.
      const highQueueLimit = scoreFor(
        [
          { atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true },
          { atMs: 31_000, controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY, value: 5_000 },
        ],
        80_000,
      );
      const cleanIsolation = scoreFor(
        [{ atMs: 31_000, controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY, value: true }],
        55_000,
      );

      expect(highQueueLimit.state.status).not.toBe("resolved");
      expect(highQueueLimit.score.total).toBe(510);
      expect(highQueueLimit.score.total).toBeLessThan(cleanIsolation.score.total);
    });
  });
});
