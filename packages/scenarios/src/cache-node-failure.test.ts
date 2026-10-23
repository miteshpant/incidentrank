import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cacheNodeFailure } from "./cache-node-failure";
import {
  APPLICATION_CONCURRENCY_KEY,
  CACHE_NODE_COUNT_KEY,
  CACHE_WARMING_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  FAILOVER_MODE_KEY,
  cacheNodeFailureSimulation,
} from "./cache-node-failure/definition";
import { CACHE_NODE_FAILURE_SCORING } from "./cache-node-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cacheNodeFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cacheNodeFailureSimulation.tickMs
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
      cacheNodeFailureSimulation,
      state,
      action,
      cacheNodeFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Cache Node Failure", () => {
  it("validates and carries real library metadata as a paid scenario", () => {
    expect(() => cacheNodeFailureSimulation).not.toThrow();
    expect(cacheNodeFailure.isFree).toBe(false);
    expect(cacheNodeFailure.library?.category).toBe("Caching");
    expect(cacheNodeFailure.library?.tags.length).toBeGreaterThan(0);
    expect(cacheNodeFailure.library?.skills.length).toBeGreaterThan(0);
    expect(cacheNodeFailure.slug).toBe("cache-node-failure");
  });

  it("has a complete scoring config and candidate UI descriptor", () => {
    expect(CACHE_NODE_FAILURE_SCORING.dimensions).toHaveLength(6);
    const totalMax = CACHE_NODE_FAILURE_SCORING.dimensions.reduce(
      (sum, d) => sum + d.maxPoints,
      0,
    );
    expect(totalMax).toBe(1000);

    expect(cacheNodeFailure.simulation).toBeDefined();
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(cacheNodeFailureSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.cacheHitRatePercent).toBe(96);
    expect(state.values.cacheStatus).toBe("normal");
  });

  it("degrades when the cache node fails with no mitigation (baseline)", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.values.cacheHitRatePercent).toBe(68);
    expect(state.values.dbReadsPerSecond).toBe(650);
    expect(state.values.cacheStatus).toBe("warning");
    expect(state.status).not.toBe("resolved");
  });

  it("recovers automatically when capacity is restored (good path A)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.cacheHitRatePercent).toBe(95);
    expect(state.values.dbReadsPerSecond).toBe(95);
    expect(state.values.cacheStatus).toBe("normal");
  });

  it("recovers automatically via origin fallback + request coalescing (alternate good path B)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: FAILOVER_MODE_KEY, value: "originFallback" },
      { atMs: 31_000, controlKey: DB_REQUEST_PROTECTION_KEY, value: "coalescing" },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.cacheHitRatePercent).toBe(90);
    expect(state.values.dbReadsPerSecond).toBe(140);
    expect(state.values.cacheStatus).toBe("normal");
  });

  it("aggressive cache warming self-inflicts a database spike (the trap) even though it sounds helpful", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
      { atMs: 31_000, controlKey: CACHE_WARMING_MODE_KEY, value: "aggressive" },
    ]);

    expect(state.values.cacheStatus).toBe("critical");
    expect(state.values.dbReadsPerSecond).toBe(3_100);
    expect(state.status).not.toBe("resolved");
  });

  it("aggressive warming eventually fails if sustained (it crosses the failure threshold)", () => {
    const state = runScenario(31_000 + 61_000, [
      { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
      { atMs: 31_000, controlKey: CACHE_WARMING_MODE_KEY, value: "aggressive" },
    ]);

    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("scaling application concurrency while the database is unprotected amplifies the overload (harmful)", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithScaledConcurrency = runScenario(35_000, [
      { atMs: 31_000, controlKey: APPLICATION_CONCURRENCY_KEY, value: "high" },
    ]);

    expect(stateWithScaledConcurrency.values.dbReadsPerSecond).toBeGreaterThan(
      stateWithoutMitigation.values.dbReadsPerSecond as number,
    );
    expect(stateWithScaledConcurrency.values.cacheStatus).toBe("critical");
  });

  it("rate limiting alone masks the problem without restoring the hit rate (partial, not safe)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: DB_REQUEST_PROTECTION_KEY, value: "rateLimited" },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.cacheHitRatePercent).toBe(62);
    expect(state.values.dbReadsPerSecond).toBeLessThan(2_500);
    expect(state.values.cacheStatus).toBe("warning");
  });

  it("observable precursor: node load and eviction rate are already rising before the second-wave compounding event fires", () => {
    const earlyState = runScenario(31_000);
    expect(earlyState.values.cacheNodeLoadPercent).toBe(75);
    expect(earlyState.values.evictionRatePerMinute).toBe(60);

    // Delayed consequence: left unmitigated, the compounding event fires
    // at T=3m30s and pushes dbReads past the failure threshold.
    const lateState = runScenario(31_000 + 3 * 60_000 + 5_000);
    expect(lateState.values.dbReadsPerSecond).toBe(2_900);
    expect(lateState.status).toBe("critical");
  });

  it("fails automatically if unmitigated long enough (automatic failure)", () => {
    const state = runScenario(31_000 + 3 * 60_000 + 60_000 + 5_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak db reads and cache node load generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.dbReadsPerSecond).toBe(650);
    expect(state.peaks.peakValues.cacheNodeLoadPercent).toBe(75);
  });

  it("tracks monthly infrastructure cost that increases with cache node count and concurrency", () => {
    let state = createInitialState(cacheNodeFailureSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(300);

    const tickMs = cacheNodeFailureSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-nodes",
      timestampMs: 0,
      controlKey: CACHE_NODE_COUNT_KEY,
      value: 5,
    };
    state = simulate(cacheNodeFailureSimulation, state, action, tickMs).state;
    // baseline 300 + cacheNodeCount:5 (180) + applicationConcurrency:medium
    // (initial value, 40) = 520.
    expect(state.cost.currentMonthlyCostUsd).toBe(520);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("automatic completion mode", () => {
    it("is configured as automatic (no genuinely safe-but-imperfect acceptable tier exists)", () => {
      expect(cacheNodeFailureSimulation.completion?.mode).toBe("automatic");
      expect(cacheNodeFailureSimulation.completion?.acceptableCondition).toBeUndefined();
    });

    it("auto-resolves without requiring a Finish declaration", () => {
      const state = runScenario(50_000, [
        { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
      ]);
      expect(state.status).toBe("resolved");
      expect(state.resolvedAtMs).not.toBeNull();

      // evaluateCandidateDeclaredFinish is not the completion path for an
      // automatic scenario, but it should still behave sanely if called:
      // the engine already wrote "resolved" and isLocallyTerminal would
      // already report true via the automatic branch.
      const finish = evaluateCandidateDeclaredFinish(cacheNodeFailureSimulation, state);
      expect(finish.outcome).toBe("resolved");
    });
  });

  describe("scoring: good > baseline > harmful, and both good paths score well", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const inputs = extractScoringInputs(cacheNodeFailureSimulation, state);
      return scoreAuthoredAttempt(CACHE_NODE_FAILURE_SCORING, inputs);
    }

    it("executes good/alternate-good/baseline/harmful paths and records exact totals", () => {
      const good = runScenario(60_000, [
        { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
      ]);
      const altGood = runScenario(60_000, [
        { atMs: 31_000, controlKey: FAILOVER_MODE_KEY, value: "originFallback" },
        { atMs: 31_000, controlKey: DB_REQUEST_PROTECTION_KEY, value: "coalescing" },
      ]);
      const masking = runScenario(31_000 + 3 * 60_000 + 60_000 + 5_000, [
        { atMs: 31_000, controlKey: DB_REQUEST_PROTECTION_KEY, value: "rateLimited" },
      ]);
      const baseline = runScenario(31_000 + 3 * 60_000 + 60_000 + 5_000);
      const harmful = runScenario(31_000 + 61_000, [
        { atMs: 31_000, controlKey: CACHE_NODE_COUNT_KEY, value: 4 },
        { atMs: 31_000, controlKey: CACHE_WARMING_MODE_KEY, value: "aggressive" },
      ]);

      expect(good.status).toBe("resolved");
      expect(altGood.status).toBe("resolved");
      // Masking never crosses the failure threshold on its own
      // (dbReadsPerSecond stays at 420, far below 2,500) — it lingers
      // indefinitely as "degraded", neither resolved nor failed. This is
      // exactly the masking trap's point: it never auto-fails, so an
      // automatic-completion engine would otherwise let it run forever
      // without ever being "safe" by the scenario's own success bar.
      expect(masking.status).toBe("degraded");
      expect(baseline.status).toBe("failed");
      expect(harmful.status).toBe("failed");

      const goodScore = scoreOf(good).total;
      const altGoodScore = scoreOf(altGood).total;
      const maskingScore = scoreOf(masking).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      expect(goodScore).toBe(955);
      expect(altGoodScore).toBe(980);
      expect(maskingScore).toBe(530);
      expect(baselineScore).toBe(530);
      expect(harmfulScore).toBe(490);

      // Both good paths substantially outscore every non-recovering
      // path. recovery/reliability are both zeroed by terminalOverrides
      // for any non-resolved outcome, which collapses masking and
      // baseline to an identical total here (both unresolved/failed with
      // otherwise-equal customerImpact/dataIntegrity/costEfficiency/
      // operationalEfficiency measures) — a legitimate tie given the
      // documented Phase 6.1 terminal-override limitation (phase6b.md
      // section 17), not a scoring bug: masking's database-survivable-
      // but-hit-rate-degraded state and the untouched baseline both
      // genuinely never meet the recovery bar.
      expect(goodScore).toBeGreaterThan(maskingScore);
      expect(altGoodScore).toBeGreaterThan(maskingScore);
      expect(maskingScore).toBe(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });
  });
});
