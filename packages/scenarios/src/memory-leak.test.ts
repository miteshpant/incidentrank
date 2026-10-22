import { createInitialState, extractScoringInputs, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { memoryLeak } from "./memory-leak";
import {
  CACHE_EVICTION_POLICY_ENABLED_KEY,
  MANUAL_RESTART_TRIGGERED_KEY,
  memoryLeakSimulation,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
} from "./memory-leak/definition";
import { MEMORY_LEAK_SCORING } from "./memory-leak/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(memoryLeakSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += memoryLeakSimulation.tickMs
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
      memoryLeakSimulation,
      state,
      action,
      memoryLeakSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Memory Leak", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(memoryLeak.isFree).toBe(false);
    expect(memoryLeak.library?.category).toBe("Infrastructure & Capacity");
    expect(memoryLeak.library?.tags.length).toBeGreaterThan(0);
    expect(memoryLeak.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(memoryLeakSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.memoryUsageMb).toBe(400);
    expect(state.values.serviceStatus).toBe("normal");
  });

  it("climbs to critical when the leak starts with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.memoryUsageMb).toBe(2_600);
    expect(state.values.serviceStatus).toBe("critical");
  });

  it("recovers durably when the memory-limit auto-restart policy is enabled", () => {
    const state = runScenario(46_000, [
      { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.memoryUsageMb).toBe(420);
  });

  it("a one-time manual restart alone looks fine at first but is not durable once the leak recurs", () => {
    const beforeRecurrence = runScenario(31_000 + 10_000, [
      { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
    ]);
    expect(beforeRecurrence.values.memoryUsageMb).toBe(420);
    expect(beforeRecurrence.values.serviceStatus).toBe("normal");

    const afterRecurrence = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
    ]);
    expect(afterRecurrence.values.memoryUsageMb).toBe(3_800);
    expect(afterRecurrence.values.serviceStatus).toBe("critical");
  });

  it("enabling the auto-restart policy survives the leak recurring, unlike a manual restart alone", () => {
    const state = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
      { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
    ]);

    expect(state.values.memoryUsageMb).toBe(420);
    expect(state.values.serviceStatus).toBe("normal");
  });

  describe("scoring classifies the early manual-restart trap as harmful", () => {
    // Regression test for a bug where the manual-restart trap's
    // actionClassifications rule gated on `whenTriggerEquals: {
    // leakRecurred: true }` — a trigger that only flips true 5 minutes
    // into the incident (see timed-events.ts). classifyAction evaluates
    // this at the moment the action is applied, not against future
    // state, so the scenario's own documented primary trap path (a
    // candidate restarting early, at 31s, well before leakRecurred ever
    // flips) was classified "neutral" instead of "harmful" — the
    // operationalEfficiency dimension never penalized it. Fixed by
    // keying the harmful classification to `leakActive` instead (the
    // trigger that is already true for the whole duration the restart
    // would plausibly be taken), matching the sibling beneficial rules
    // in action-classifications.ts and every other scenario's pattern.
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const inputs = extractScoringInputs(memoryLeakSimulation, state);
      return scoreAuthoredAttempt(MEMORY_LEAK_SCORING, inputs);
    }

    it("penalizes an early one-time manual restart via operationalEfficiency", () => {
      const trap = runScenario(5 * 60_000 + 10_000, [
        { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
      ]);

      const score = scoreOf(trap);
      expect(score.breakdown.operationalEfficiency).toBeLessThan(50);
    });

    it("scores the durable fix higher than the early manual-restart trap", () => {
      // Both paths actually resolve quickly (the trap's one-time restart
      // does bring memory back under the success threshold at 46s, well
      // before the 5-minute recurrence) — the scenario's teaching point
      // is not "the trap fails to resolve," but that it is not durable
      // and is a worse operational decision, which must show up in the
      // score even though both runs reach a "resolved" status.
      const good = runScenario(46_000, [
        { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
      ]);
      const trap = runScenario(5 * 60_000 + 10_000, [
        { atMs: 31_000, controlKey: MANUAL_RESTART_TRIGGERED_KEY, value: true },
      ]);

      expect(good.status).toBe("resolved");
      expect(trap.status).toBe("resolved");

      const goodBreakdown = scoreOf(good);
      const trapBreakdown = scoreOf(trap);

      expect(goodBreakdown.total).toBeGreaterThan(trapBreakdown.total);
      expect(goodBreakdown.breakdown.operationalEfficiency).toBeGreaterThan(
        trapBreakdown.breakdown.operationalEfficiency,
      );
    });
  });

  it("cache eviction alone slows but does not fully stop the climb", () => {
    const state = runScenario(31_000 + 10_000, [
      { atMs: 31_000, controlKey: CACHE_EVICTION_POLICY_ENABLED_KEY, value: true },
    ]);

    expect(state.values.memoryUsageMb).toBe(1_800);
    expect(state.values.serviceStatus).toBe("warning");
  });

  it("fails if memory stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak memory usage generically via numericWatchFields", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.peaks.peakValues.memoryUsageMb).toBe(3_800);
  });

  it("tracks monthly infrastructure cost that increases with the auto-restart policy", () => {
    let state = createInitialState(memoryLeakSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(80);

    const tickMs = memoryLeakSimulation.tickMs;
    const action: CandidateAction = {
      id: "enable-auto-restart",
      timestampMs: 0,
      controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
      value: true,
    };
    state = simulate(memoryLeakSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(95);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
