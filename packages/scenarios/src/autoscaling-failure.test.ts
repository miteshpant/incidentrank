import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { autoscalingFailure } from "./autoscaling-failure";
import {
  autoscalingFailureSimulation,
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./autoscaling-failure/definition";
import { AUTOSCALING_FAILURE_SCORING } from "./autoscaling-failure/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(autoscalingFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += autoscalingFailureSimulation.tickMs
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
      autoscalingFailureSimulation,
      state,
      action,
      autoscalingFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Autoscaling Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(autoscalingFailure.isFree).toBe(false);
    expect(autoscalingFailure.library?.category).toBe("Infrastructure & Capacity");
    expect(autoscalingFailure.library?.tags.length).toBeGreaterThan(0);
    expect(autoscalingFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(autoscalingFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.currentInstanceCount).toBe(4);
    expect(state.values.capacityStatus).toBe("normal");
  });

  it("becomes critically capped when traffic spikes with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.currentInstanceCount).toBe(4);
    expect(state.values.capacityStatus).toBe("critical");
  });

  it("recovers cleanly when the instance cap is raised to an adequate level, and resolves on an explicit Finish declaration", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine
    // — only Finish may do that) — it stays non-terminal even once the
    // success condition has long since sustained.
    expect(state.status).not.toBe("resolved");
    expect(state.values.currentInstanceCount).toBe(18);

    const finish = evaluateCandidateDeclaredFinish(autoscalingFailureSimulation, state);
    expect(finish.outcome).toBe("resolved");
    expect(finish.completionTier).toBe("optimal");
  });

  it("tuning scale-up threshold and cooldown aggressively is ineffective while the cap stays low", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithAggressiveTuning = runScenario(35_000, [
      { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 50 },
      { atMs: 31_000, controlKey: SCALE_UP_COOLDOWN_SECONDS_KEY, value: 30 },
    ]);

    // Instance count hits the exact same (unchanged) ceiling either way —
    // tuning reaction speed does nothing when the cap itself is the
    // binding constraint.
    expect(stateWithAggressiveTuning.values.currentInstanceCount).toBe(
      stateWithoutMitigation.values.currentInstanceCount,
    );
    expect(stateWithAggressiveTuning.values.capacityStatus).toBe("critical");
    expect(stateWithAggressiveTuning.values.cpuUtilizationPercent as number).toBeGreaterThan(90);
  });

  it("raising the cap moderately is only a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.capacityStatus).toBe("warning");
    expect(state.values.currentInstanceCount).toBe(8);

    const finish = evaluateCandidateDeclaredFinish(autoscalingFailureSimulation, state);
    expect(finish.outcome).toBe("declared_unstable");
  });

  it("raising the cap moderately AND tuning reaction speed improves further than the cap alone", () => {
    const capOnly = runScenario(35_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 },
    ]);
    const capWithTuning = runScenario(35_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 },
      { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 50 },
      { atMs: 31_000, controlKey: SCALE_UP_COOLDOWN_SECONDS_KEY, value: 30 },
    ]);

    expect(capWithTuning.values.cpuUtilizationPercent as number).toBeLessThan(
      capOnly.values.cpuUtilizationPercent as number,
    );
  });

  it("escalates when traffic surges further while still unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.capacityStatus).toBe("critical");
    expect(state.values.cpuUtilizationPercent).toBe(99);
  });

  it("an adequate cap survives the further traffic surge, and resolves on an explicit Finish declaration", () => {
    const state = runScenario(5 * 60_000 + 30_000, [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 },
    ]);

    expect(state.status).not.toBe("resolved");

    const finish = evaluateCandidateDeclaredFinish(autoscalingFailureSimulation, state);
    expect(finish.outcome).toBe("resolved");
  });

  it("fails if CPU utilization stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak request queue depth generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.requestQueueDepth).toBe(400);
  });

  it("tracks monthly infrastructure cost that increases with the instance cap", () => {
    let state = createInitialState(autoscalingFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(200);

    const tickMs = autoscalingFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "raise-cap",
      timestampMs: 0,
      controlKey: MAX_INSTANCE_COUNT_KEY,
      value: 16,
    };
    state = simulate(autoscalingFailureSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(650);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 },
      { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 70 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring-path regression", () => {
    // This scenario's definition.ts has no `completion` field, which
    // still defaults to "automatic" — but per the Phase 7.1 doctrine the
    // engine never auto-writes resolvedAtMs for any mode; scoring a
    // successful path always goes through the same Finish-declaration
    // pipeline every other scenario uses (evaluateCandidateDeclaredFinish
    // + extractFinishScoringInputs), never a bare extractScoringInputs
    // call on the raw simulated state.
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finish = evaluateCandidateDeclaredFinish(autoscalingFailureSimulation, state);
      const inputs = extractFinishScoringInputs(autoscalingFailureSimulation, finish);
      return scoreAuthoredAttempt(AUTOSCALING_FAILURE_SCORING, inputs);
    }

    // Real action sequences grounded in rules.ts / action-classifications.ts:
    //
    //  - good: raises maxInstanceCount to 16 at 31s, matching the
    //    "adequate-cap-recovery" rule (controlAtLeast 16). This is the only
    //    path that reaches successCondition (cpu<=70, errorRate<1,
    //    capacityStatus!=critical sustained 15s) and resolves.
    //  - baseline: no actions at all — traffic spikes at 30s, hits the
    //    "autoscaling-critical-default" rule (cpu 98%), which satisfies
    //    failureCondition (cpu>=95 sustained 60s) if left unmitigated long
    //    enough. Compared at 35s (still just "critical", pre-failure) so
    //    it is duration-matched against harmful/partial below.
    //  - harmful: explicitly reasserts maxInstanceCount at its low default
    //    (4) alongside aggressive threshold/cooldown tuning, matching the
    //    "aggressive-tuning-low-cap-harmful" rule. action-classifications.ts
    //    marks maxInstanceCount<=4 (while trafficSpiking) "harmful" — the
    //    scenario's documented trap: tuning reaction speed does nothing
    //    while the cap itself is still the binding constraint.
    //  - partial: raises maxInstanceCount to 8 only, matching
    //    "moderate-cap-only" — a real, distinct partial-improvement state
    //    (capacityStatus "warning", not "critical", but errorRate 4 and
    //    cpu 75% still fail successCondition).
    function good() {
      return runScenario(50_000, [{ atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 16 }]);
    }
    function baseline() {
      return runScenario(35_000);
    }
    function harmful() {
      return runScenario(35_000, [
        { atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 4 },
        { atMs: 31_000, controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY, value: 50 },
        { atMs: 31_000, controlKey: SCALE_UP_COOLDOWN_SECONDS_KEY, value: 30 },
      ]);
    }
    function partial() {
      return runScenario(35_000, [{ atMs: 31_000, controlKey: MAX_INSTANCE_COUNT_KEY, value: 8 }]);
    }

    it("resolves and scores highest when the cap is raised to an adequate level", () => {
      const state = good();
      expect(state.status).not.toBe("resolved");
      expect(evaluateCandidateDeclaredFinish(autoscalingFailureSimulation, state).outcome).toBe(
        "resolved",
      );

      const score = scoreOf(state);
      // 825, not the pre-Phase-7.1 960: deriveScoringResolvedAtMs credits
      // the INSTANT the success condition first became continuously true
      // (31_000ms, 1s after incident start — recoveryTimeSeconds=1, top
      // band, 300/300), not the moment its 15s sustain window finished
      // (46_000ms, what the old auto-resolving engine used). Because
      // totalTimeInCriticalMs (2_000ms) is measured against that same
      // honest 1-second window, criticalTimeRatio comes out to 2.0 — the
      // worst reliability band (15/150) — even though recovery itself
      // scores at its very best. This is the same resolvedAtMs semantics
      // every other candidate_declared scenario already uses (see
      // db-connection-saturation.test.ts's identical scoreOf pattern);
      // autoscaling-failure simply never exercised a genuinely-resolved
      // scoring path before Phase 7.1 removed its automatic auto-finish.
      expect(score.total).toBe(825);
      expect(score.breakdown.recovery).toBe(300);
      expect(score.breakdown.reliability).toBeGreaterThan(0);
    });

    it("stays unresolved (critical) with no mitigation and scores below the resolved path", () => {
      const state = baseline();
      expect(state.status).toBe("critical");

      const goodScore = scoreOf(good());
      const baselineScore = scoreOf(state);
      expect(baselineScore.total).toBeLessThan(goodScore.total);
      // terminalOverrides zero out recovery/reliability for any unresolved
      // attempt, regardless of action history.
      expect(baselineScore.breakdown.recovery).toBe(0);
      expect(baselineScore.breakdown.reliability).toBe(0);
    });

    it("penalizes the aggressive-tuning-with-low-cap trap via operationalEfficiency, scoring it below the equal-duration no-action baseline", () => {
      const harmfulState = harmful();
      const baselineState = baseline();

      expect(harmfulState.status).toBe("critical");
      expect(harmfulState.numberOfHarmfulChanges).toBe(1);

      const harmfulScore = scoreOf(harmfulState);
      const baselineScore = scoreOf(baselineState);

      // Reaching for the plausible-but-ineffective tuning knobs while
      // leaving maxInstanceCount at its harmful-classified default (<=4,
      // per action-classifications.ts) earns a strictly worse score than
      // doing nothing at all: operationalEfficiency absorbs a -15 penalty
      // (harmfulChangeCount >= 1) that an untouched baseline never pays,
      // while every other dimension ties (both unresolved at the same
      // 35s mark, same zero cost increase, same sub-$5k revenue-loss
      // band).
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      expect(harmfulScore.breakdown.operationalEfficiency).toBeLessThan(
        baselineScore.breakdown.operationalEfficiency,
      );
      expect(harmfulScore.breakdown.recovery).toBe(baselineScore.breakdown.recovery);
      expect(harmfulScore.breakdown.customerImpact).toBe(baselineScore.breakdown.customerImpact);
    });

    it("a moderate cap raise alone is a genuine partial state, costing more than baseline for no operational-efficiency gain", () => {
      const partialState = partial();
      const baselineState = baseline();

      expect(partialState.status).not.toBe("resolved");
      expect(partialState.values.capacityStatus).toBe("warning");

      const partialScore = scoreOf(partialState);
      const baselineScore = scoreOf(baselineState);

      // Raising the cap to 8 is a genuine (non-harmful, non-beneficial —
      // it matches neither action-classifications.ts rule) config change
      // that increases monthly infra cost (perUnitMonthlyUsd jumps from
      // $0 at cap 4 to $150 at cap 8), so costEfficiency drops from 100 to
      // 85 even though the attempt never resolves. Net effect: the same
      // total as the harmful trap, via a different dimension.
      expect(partialScore.breakdown.costEfficiency).toBeLessThan(baselineScore.breakdown.costEfficiency);
      expect(partialScore.total).toBeLessThan(baselineScore.total);
    });

    it("the harmful trap and the partial cap-raise land at the same total score through different penalized dimensions", () => {
      // Not a universal good>partial>baseline>harmful ladder: here
      // baseline (550) beats both harmful (535, penalized via
      // operationalEfficiency for the classified-harmful action) and
      // partial (535, penalized via costEfficiency for a real but
      // insufficient cost increase) by the same margin, through entirely
      // different dimensions reaching the same total.
      const harmfulScore = scoreOf(harmful());
      const partialScore = scoreOf(partial());

      expect(harmfulScore.total).toBe(partialScore.total);
      expect(harmfulScore.breakdown.operationalEfficiency).toBeLessThan(
        partialScore.breakdown.operationalEfficiency,
      );
      expect(partialScore.breakdown.costEfficiency).toBeLessThan(
        harmfulScore.breakdown.costEfficiency,
      );
    });
  });
});
