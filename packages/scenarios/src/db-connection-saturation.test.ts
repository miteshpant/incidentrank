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
import {
  dbConnectionSaturationSimulation,
  POOL_SIZE_KEY,
  QUERY_TIMEOUT_MS_KEY,
  READ_REPLICA_ENABLED_KEY,
} from "./db-connection-saturation/definition";
import { DB_CONNECTION_SATURATION_SCORING } from "./db-connection-saturation/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dbConnectionSaturationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dbConnectionSaturationSimulation.tickMs
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
      dbConnectionSaturationSimulation,
      state,
      action,
      dbConnectionSaturationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

/**
 * Genericity proof (originally Phase 5's engine-generalization mandate,
 * preserved through the Phase 6 promotion to a launch scenario — see
 * docs/implementation_plan/phase6.md): this scenario's state keys
 * (connectionUsage, requestLatencyMs, errorRate, dbStatus) share nothing
 * with Payment Retry Storm's domain, and run entirely as authored data
 * through the same generic simulator — no new engine code. These tests
 * remain the proof that the engine is scenario-agnostic; see
 * db-connection-saturation-launch.test.ts for candidate-facing launch
 * coverage (richer architecture, batch-job escalation, harmful-timeout
 * path, cost tracking) added when this scenario was promoted.
 */
describe("Database Connection Saturation — genericity proof", () => {
  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(dbConnectionSaturationSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.connectionUsage).toBe(40);
    expect(state.values.dbStatus).toBe("normal");
    expect(state.incidentStartedAtMs).toBeNull();
  });

  it("saturates when the pool is too small to absorb the spike", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.connectionUsage).toBe(98);
    expect(state.values.dbStatus).toBe("critical");
  });

  it("reaches a sustained success state when the pool is scaled and the read replica is enabled (Phase 6.1: candidate_declared, never auto-resolves)", () => {
    const state = runScenario(60_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
      { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
    ]);

    // This scenario is candidate_declared — the engine itself never
    // auto-writes "resolved" (see packages/simulator/src/tick.ts's
    // completion-mode gate). The success condition is nonetheless
    // genuinely, continuously satisfied and sustained well past its own
    // 15s window; Finish Incident is what converts this into a resolved
    // outcome (see packages/scenarios/src/db-connection-saturation.test.ts's
    // sibling launch-quality suite / apps/web's finishAttempt tests for
    // the server-side Finish evaluation itself).
    expect(state.status).not.toBe("resolved");
    expect(state.resolvedAtMs).toBeNull();
    expect(state.values.connectionUsage).toBeLessThanOrEqual(60);
    expect(state.values.errorRate).toBeLessThan(1);
    expect(state.values.dbStatus).not.toBe("critical");
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      dbConnectionSaturationSimulation.successCondition.sustainedSeconds,
    );
  });

  it("only partially improves when the pool is scaled without the read replica", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    ]);

    expect(state.status).toBe("degraded");
    expect(state.values.dbStatus).toBe("warning");
  });

  it("stays active (never auto-fails) even after error rate remains critical past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      dbConnectionSaturationSimulation.failureCondition.sustainedSeconds,
    );
  });

  it("tracks peak connection usage generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.connectionUsage).toBe(98);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
      { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring orders good > partial > baseline > harmful", () => {
    // Database Connection Saturation is candidate_declared (Phase 6.1):
    // the engine never auto-writes resolvedAtMs even for the genuine
    // scaled-pool-with-replica recovery (see definition.ts), so score via
    // the same Finish-equivalent derivation finishAttempt uses — never a
    // raw extractScoringInputs call, which would incorrectly score the
    // good case as "unresolved" (0 points on recovery and reliability).
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(dbConnectionSaturationSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(dbConnectionSaturationSimulation, finishResult)
          : extractScoringInputs(dbConnectionSaturationSimulation, state);
      return scoreAuthoredAttempt(DB_CONNECTION_SATURATION_SCORING, inputs);
    }

    it("orders good far above the terminal outcomes, and baseline above harmful", () => {
      // Good: "scaled-pool-with-replica" rule — pool scaled to >= 100 AND
      // the read replica enabled reaches `recovering`
      // (connectionUsage 52, errorRate 0.4, dbStatus "normal"), which
      // genuinely satisfies and sustains successCondition.
      const good = runScenario(60_000, [
        { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
        { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
      ]);

      // Partial: "scaled-pool-only" rule — pool scaled to >= 100 without
      // the replica reaches `degraded` (errorRate 3.5) and never
      // satisfies successCondition (connectionUsage 78 > 60) nor
      // failureCondition, so it runs out the clock neither resolved nor
      // failed. Sampled well before batchPressureRising fires at t=3min
      // so it stays on this exact rule, not the rising-pressure or
      // batch-job-overwhelms tiers.
      const partial = runScenario(35_000, [
        { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
      ]);

      // Baseline: no action at all — "saturated-default" rule drives
      // errorRate to 22 (>= the failureCondition's 20 threshold),
      // sustained well past the old 60s window — but the engine no
      // longer auto-fails on a sustained breach (only the uniform
      // 35-minute ATTEMPT_CEILING_MS does), so this stays unresolved
      // (status "critical"), not "failed".
      const baseline = runScenario(30_000 + 61_000);

      // Harmful: "high-timeout-small-pool-harmful" rule — raising the
      // query timeout to >= 15_000ms while the pool stays <= 50 reaches
      // `saturated-worsening` (errorRate 31, revenue-loss rate 900/min,
      // worse than plain `saturated`'s 500/min), and action-classifications.ts
      // explicitly tags both the small pool and the high timeout as
      // "harmful" for this trigger. Like baseline, this sustained breach
      // no longer auto-fails the attempt either.
      const harmful = runScenario(30_000 + 61_000, [
        { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 15_000 },
      ]);

      expect(good.status).not.toBe("resolved");
      expect(good.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        dbConnectionSaturationSimulation.successCondition.sustainedSeconds,
      );
      expect(partial.status).toBe("degraded");
      expect(partial.values.dbStatus).toBe("warning");
      expect(baseline.status).not.toBe("failed");
      expect(baseline.failedAtMs).toBeNull();
      expect(baseline.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        dbConnectionSaturationSimulation.failureCondition.sustainedSeconds,
      );
      expect(harmful.status).not.toBe("failed");
      expect(harmful.failedAtMs).toBeNull();
      expect(harmful.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        dbConnectionSaturationSimulation.failureCondition.sustainedSeconds,
      );
      expect(harmful.values.dbStatus).toBe("critical");

      const goodScore = scoreOf(good).total;
      const partialScore = scoreOf(partial).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      // The genuinely-sustained good recovery clears every unresolved
      // outcome by a wide margin: recovery/reliability all carry the
      // same terminalOverrides.unresolved=0 penalty for any run that
      // never resolves — partial (never satisfies successCondition or
      // failureCondition), and baseline/harmful (sustain a breach past
      // the old failure window, but no longer auto-fail, so they too
      // end the run merely unresolved) — so recovery+reliability can
      // never distinguish partial/baseline/harmful from each other;
      // only good escapes that floor.
      expect(goodScore).toBeGreaterThan(baselineScore);
      expect(goodScore).toBeGreaterThan(harmfulScore);
      expect(goodScore).toBeGreaterThan(partialScore);

      // Baseline beats the harmful high-timeout path: both stay
      // unresolved (so recovery/reliability tie at 0 for both via the
      // same terminalOverrides.unresolved floor), and customerImpact's
      // wide >=50_000 catch-all band ties both at 200 despite harmful's
      // materially larger revenueLossUsd) — the real
      // differentiator is operationalEfficiency, where action-
      // classifications.ts's harmful tag for queryTimeoutMs >= 15_000
      // costs harmful 15 points (50 -> 35) that baseline's zero actions
      // never lose.
      expect(baselineScore).toBeGreaterThan(harmfulScore);

      // Counterintuitively, the "scaled-pool-only" partial improvement
      // scores BELOW both unresolved baseline/harmful runs. It ties
      // baseline/harmful's 0 on recovery and reliability (same
      // terminalOverrides.unresolved floor — never resolving is scored
      // no better than never recovering), but then also pays
      // costEfficiency's bottom band:
      // scaling poolSize to 200 raises costIncreaseRatio to
      // (420-200)/200 = 1.1 (perUnitMonthlyUsd["poolSize:200"]=420
      // against a baselineMonthlyUsd of 200), past the `{ atMost: 1,
      // points: 35 }` band into the catch-all `{ points: 10 }`, while
      // baseline/harmful's untouched pool keeps costIncreaseRatio at 0
      // (costEfficiency's top band, 100 points). That 90-point gap is
      // larger than operationalEfficiency's entire spread, so an
      // incomplete, indefinitely-unresolved mitigation that pays for
      // capacity it never fully uses to recover scores worse here than
      // doing nothing at all.
      expect(baselineScore).toBeGreaterThan(partialScore);
      expect(harmfulScore).toBeGreaterThan(partialScore);
    });

    it("penalizes the high-timeout harmful path's operationalEfficiency for its classified-harmful action", () => {
      const harmful = runScenario(30_000 + 61_000, [
        { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 15_000 },
      ]);

      const score = scoreOf(harmful);
      expect(score.breakdown.operationalEfficiency).toBeLessThan(50);
    });
  });
});
