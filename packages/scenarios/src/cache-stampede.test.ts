import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { cacheStampede } from "./cache-stampede";
import {
  CACHE_TTL_SECONDS_KEY,
  cacheStampedeSimulation,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
} from "./cache-stampede/definition";
import { CACHE_STAMPEDE_SCORING } from "./cache-stampede/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cacheStampedeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cacheStampedeSimulation.tickMs
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
      cacheStampedeSimulation,
      state,
      action,
      cacheStampedeSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Cache Stampede", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(cacheStampede.isFree).toBe(false);
    expect(cacheStampede.library?.category).toBe("Caching");
    expect(cacheStampede.library?.tags.length).toBeGreaterThan(0);
    expect(cacheStampede.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(cacheStampedeSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.cacheHitRate).toBe(98);
    expect(state.values.cacheStatus).toBe("normal");
  });

  it("stampedes critically when the trigger fires with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.queuedRequests).toBe(700);
    expect(state.values.cacheStatus).toBe("critical");
  });

  it("recovers cleanly when request coalescing is enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.queuedRequests).toBe(0);
    expect(evaluateCandidateDeclaredFinish(cacheStampedeSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("lowering the TTL without coalescing is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithLowerTtl = runScenario(35_000, [
      { atMs: 31_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 10 },
    ]);

    expect(stateWithLowerTtl.values.queuedRequests).toBeGreaterThan(
      stateWithoutMitigation.values.queuedRequests as number,
    );
    expect(stateWithLowerTtl.values.cacheStatus).toBe("critical");
  });

  it("scaling the origin connection pool without coalescing masks the symptom but never stops the stampede from recurring", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: ORIGIN_CONNECTION_POOL_SIZE_KEY, value: 200 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.cacheStatus).toBe("warning");
    expect(state.values.queuedRequests).toBe(80);
  });

  it("fails if the request queue stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak queued requests generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.queuedRequests).toBe(700);
  });

  it("tracks monthly infrastructure cost that increases with origin connection pool size", () => {
    let state = createInitialState(cacheStampedeSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(120);

    const tickMs = cacheStampedeSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-origin-pool",
      timestampMs: 0,
      controlKey: ORIGIN_CONNECTION_POOL_SIZE_KEY,
      value: 200,
    };
    state = simulate(cacheStampedeSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(540);
  });

  it("scores a visible-but-partial mitigation above a no-op or an actively harmful change, and never below it", () => {
    // Regression test for a confirmed scoring bug: recovery(300pts) and
    // reliability(150pts) both zero out identically via
    // terminalOverrides.unresolved for EVERY non-resolved outcome, so a
    // candidate who visibly reduced live harm via pool scaling (queuedRequests
    // 700->80, cacheStatus critical->warning) must not score at or below a
    // candidate who did nothing, or one who took the actively-labeled-harmful
    // lower-TTL action — customerImpact/costEfficiency must carry that signal
    // instead. Run just before the 60s sustained failure window completes
    // (matching the bug's original reproduction), so all four attempts remain
    // "unresolved" rather than "failed".
    const UNTIL_MS = 88_000;

    function scoreFor(actions: TimedAction[]) {
      const state = runScenario(UNTIL_MS, actions);
      expect(state.status).not.toBe("resolved");
      expect(state.status).not.toBe("failed");
      const inputs = extractScoringInputs(cacheStampedeSimulation, state);
      return scoreAuthoredAttempt(CACHE_STAMPEDE_SCORING, inputs).total;
    }

    const baselineScore = scoreFor([]);
    const harmfulScore = scoreFor([
      { atMs: 31_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 10 },
    ]);
    const partialScore = scoreFor([
      { atMs: 31_000, controlKey: ORIGIN_CONNECTION_POOL_SIZE_KEY, value: 50 },
    ]);
    const maskedCostWasteScore = scoreFor([
      { atMs: 31_000, controlKey: ORIGIN_CONNECTION_POOL_SIZE_KEY, value: 200 },
    ]);

    // The harmful trap must never outscore a visible partial improvement,
    // and a candidate who visibly reduced live harm (either pool-scaling
    // path) must never score at or below someone who did nothing or who
    // took the actively-harmful action.
    expect(partialScore).toBeGreaterThan(maskedCostWasteScore);
    expect(maskedCostWasteScore).toBeGreaterThan(baselineScore);
    expect(maskedCostWasteScore).toBeGreaterThan(harmfulScore);
    expect(baselineScore).toBeGreaterThan(harmfulScore);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 300 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
