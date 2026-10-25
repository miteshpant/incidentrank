import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { deploymentRegression } from "./deployment-regression";
import {
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
  deploymentRegressionSimulation,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
} from "./deployment-regression/definition";
import { DEPLOYMENT_REGRESSION_SCORING } from "./deployment-regression/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(deploymentRegressionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += deploymentRegressionSimulation.tickMs
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
      deploymentRegressionSimulation,
      state,
      action,
      deploymentRegressionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Deployment Regression", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(deploymentRegression.isFree).toBe(false);
    expect(deploymentRegression.library?.category).toBe("Deployments & Reliability");
    expect(deploymentRegression.library?.tags.length).toBeGreaterThan(0);
    expect(deploymentRegression.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(deploymentRegressionSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.errorRate).toBe(0.1);
    expect(state.values.deployStatus).toBe("normal");
  });

  it("regresses critically when the deploy's regression is detected with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.errorRate).toBe(8.5);
    expect(state.values.deployStatus).toBe("critical");
  });

  it("recovers cleanly when rolled back to the previous version", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY, value: true },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.errorRate).toBe(0.2);
    expect(evaluateCandidateDeclaredFinish(deploymentRegressionSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("recovers cleanly when canary traffic is driven to zero", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CANARY_TRAFFIC_PERCENT_KEY, value: 0 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.errorRate).toBe(0.2);
    expect(evaluateCandidateDeclaredFinish(deploymentRegressionSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("enabling debug logging without a traffic-routing change is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithDebugLoggingOnly = runScenario(35_000, [
      { atMs: 31_000, controlKey: DEBUG_LOGGING_ENABLED_KEY, value: true },
    ]);

    expect(stateWithDebugLoggingOnly.values.errorRate).toBeGreaterThan(
      stateWithoutMitigation.values.errorRate as number,
    );
    expect(stateWithDebugLoggingOnly.values.deployStatus).toBe("critical");
  });

  it("reducing canary traffic to 10% is a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: CANARY_TRAFFIC_PERCENT_KEY, value: 10 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.deployStatus).toBe("warning");
    expect(state.values.errorRate).toBe(1.2);
  });

  it("escalates once memory growth compounds the unmitigated regression", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.deployStatus).toBe("critical");
    expect(state.values.memoryUsageMb).toBe(1_400);
  });

  it("fails if error rate stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak error rate generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.errorRate).toBe(8.5);
  });

  it("keeps monthly infrastructure cost flat — these controls are deploy/traffic config, not infrastructure scaling", () => {
    let state = createInitialState(deploymentRegressionSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(120);

    const tickMs = deploymentRegressionSimulation.tickMs;
    const action: CandidateAction = {
      id: "rollback",
      timestampMs: 0,
      controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY,
      value: true,
    };
    state = simulate(deploymentRegressionSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(120);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring orders good > baseline > harmful", () => {
    // Regression test for a bug where the harmful trap (debug logging
    // left on, full traffic still on the regressed version) and the pure
    // baseline/no-action path both mapped to the same "regressing"
    // incidentState, so revenueLossRatePerMinute (keyed only by
    // incidentState) accrued identically for both, and customerImpact's
    // bands were wide enough that both saturated the same top band
    // anyway — the harmful path scored only ~15/1000 points below doing
    // nothing, driven entirely by the small operationalEfficiency
    // penalty. Fixed by giving the harmful rule its own
    // "regressing-harmful" incidentState with a higher revenue-loss rate
    // (rules.ts, revenue-and-cost.ts) and tightening customerImpact's
    // bands to this scenario's actual revenue scale (scoring.ts) so the
    // measurable difference in revenueLossUsd actually crosses a band.
    // The engine itself never auto-writes resolvedAtMs (Phase 7.1
    // doctrine) — score a genuinely-resolvable run via its Finish
    // declaration; every other (unresolved/failed) run still scores
    // correctly via a raw extractScoringInputs call.
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(deploymentRegressionSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(deploymentRegressionSimulation, finishResult)
          : extractScoringInputs(deploymentRegressionSimulation, state);
      return scoreAuthoredAttempt(DEPLOYMENT_REGRESSION_SCORING, inputs);
    }

    it("the harmful debug-logging trap scores below the baseline no-action path", () => {
      const baseline = runScenario(5 * 60_000);
      const harmful = runScenario(5 * 60_000, [
        { atMs: 31_000, controlKey: DEBUG_LOGGING_ENABLED_KEY, value: true },
      ]);

      expect(baseline.status).toBe("failed");
      expect(harmful.status).toBe("failed");

      const baselineScore = scoreOf(baseline);
      const harmfulScore = scoreOf(harmful);

      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      expect(harmfulScore.breakdown.customerImpact).toBeLessThan(
        baselineScore.breakdown.customerImpact,
      );
      expect(harmfulScore.breakdown.operationalEfficiency).toBeLessThan(
        baselineScore.breakdown.operationalEfficiency,
      );
    });

    it("the good rollback path scores above both baseline and the harmful trap", () => {
      const good = runScenario(60_000, [
        { atMs: 31_000, controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY, value: true },
      ]);
      const baseline = runScenario(5 * 60_000);

      const goodScore = scoreOf(good).total;
      const baselineScore = scoreOf(baseline).total;

      expect(goodScore).toBeGreaterThan(baselineScore);
    });
  });
});
