import { createInitialState, extractScoringInputs, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { rateLimitFailure } from "./rate-limit-failure";
import {
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  rateLimitFailureSimulation,
  REQUEST_CONCURRENCY_KEY,
  RETRY_BACKOFF_STRATEGY_KEY,
} from "./rate-limit-failure/definition";
import { RATE_LIMIT_FAILURE_SCORING } from "./rate-limit-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(rateLimitFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += rateLimitFailureSimulation.tickMs
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
      rateLimitFailureSimulation,
      state,
      action,
      rateLimitFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Rate-Limit Failure", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(rateLimitFailure.isFree).toBe(false);
    expect(rateLimitFailure.library?.category).toBe("API & Traffic");
    expect(rateLimitFailure.library?.tags.length).toBeGreaterThan(0);
    expect(rateLimitFailure.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(rateLimitFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.rateLimitStatus).toBe("normal");
  });

  it("throttles critically when the rate limit is exceeded with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.rateLimitViolationRate).toBe(42);
    expect(state.values.rateLimitStatus).toBe("critical");
  });

  it("recovers cleanly with client-side rate limiting and exponential-with-jitter backoff", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.rateLimitViolationRate).toBe(0.3);
  });

  it("raising request concurrency with no backoff is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithHarmfulConcurrency = runScenario(35_000, [
      { atMs: 31_000, controlKey: REQUEST_CONCURRENCY_KEY, value: 32 },
    ]);

    expect(stateWithHarmfulConcurrency.values.rateLimitViolationRate).toBeGreaterThan(
      stateWithoutMitigation.values.rateLimitViolationRate as number,
    );
    expect(stateWithHarmfulConcurrency.values.rateLimitStatus).toBe("critical");
  });

  it("exponential-with-jitter backoff alone is a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.rateLimitStatus).toBe("warning");
    expect(state.values.rateLimitViolationRate).toBe(14);
  });

  it("fixed-delay backoff alone is a smaller partial improvement than exponential-with-jitter", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "fixed-delay" },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.rateLimitStatus).toBe("warning");
    expect(state.values.rateLimitViolationRate).toBe(28);
    expect(state.values.rateLimitViolationRate as number).toBeGreaterThan(14);
  });

  it("escalates when the provider tightens its limit further unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.rateLimitStatus).toBe("critical");
    expect(state.values.rateLimitViolationRate).toBe(72);
  });

  it("fails if rate-limit violations stay critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak retry queue depth generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.retryQueueDepth).toBe(410);
  });

  it("tracks monthly infrastructure cost as a modest flat baseline", () => {
    const state = createInitialState(rateLimitFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(60);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring differentiates the partial-improvement tiers from baseline", () => {
    // Regression test for a bug where jitter-only (violationRate 14) and
    // fixed-delay-only (violationRate 28) partials, and even the
    // no-action baseline (violationRate 42), all scored an identical 550
    // total: terminalOverrides.unresolved/failed zeroed recovery/
    // reliability identically for all three, and no other dimension was
    // sensitive to violationRate/revenue-loss differences at realistic
    // attempt durations. Fixed by giving the two partial rules distinct
    // incidentState labels (see rules.ts) with distinct
    // revenueLossRatePerMinute entries (see revenue-and-cost.ts), tuning
    // customerImpact's bands to this scenario's actual revenue-loss
    // scale, and giving customerImpact its own `failed` terminal override
    // so a fast-failing baseline can't look artificially cheap purely
    // because it ended sooner than a longer-running partial.
    const FULL_ATTEMPT_MS = 12 * 60_000; // scenario's own estimatedMinutes: 12

    function scoreOf(state: ReturnType<typeof runScenario>) {
      const inputs = extractScoringInputs(rateLimitFailureSimulation, state);
      return scoreAuthoredAttempt(RATE_LIMIT_FAILURE_SCORING, inputs);
    }

    it("orders good > jitter-only partial > fixed-delay-only partial > baseline", () => {
      const good = runScenario(50_000, [
        { atMs: 31_000, controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY, value: true },
        { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
      ]);

      // Neither partial ever crosses the failure condition's threshold
      // (40) or satisfies the success condition, so both run the full
      // attempt length and end "unresolved".
      const jitterOnly = runScenario(FULL_ATTEMPT_MS, [
        { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "exponential-with-jitter" },
      ]);
      const fixedDelayOnly = runScenario(FULL_ATTEMPT_MS, [
        { atMs: 31_000, controlKey: RETRY_BACKOFF_STRATEGY_KEY, value: "fixed-delay" },
      ]);

      // Baseline's violationRate (42) crosses the failure threshold and
      // naturally ends via the failure condition's 60s sustain window,
      // well before the full attempt length.
      const baseline = runScenario(30_000 + 61_000);

      expect(jitterOnly.status).not.toBe("resolved");
      expect(jitterOnly.status).not.toBe("failed");
      expect(fixedDelayOnly.status).not.toBe("resolved");
      expect(fixedDelayOnly.status).not.toBe("failed");
      expect(baseline.status).toBe("failed");

      const goodScore = scoreOf(good).total;
      const jitterScore = scoreOf(jitterOnly).total;
      const fixedDelayScore = scoreOf(fixedDelayOnly).total;
      const baselineScore = scoreOf(baseline).total;

      expect(goodScore).toBeGreaterThan(jitterScore);
      expect(jitterScore).toBeGreaterThan(fixedDelayScore);
      expect(fixedDelayScore).toBeGreaterThan(baselineScore);
    });
  });
});
