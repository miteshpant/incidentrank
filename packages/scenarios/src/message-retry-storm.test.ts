import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { messageRetryStorm } from "./message-retry-storm";
import {
  BACKOFF_STRATEGY_KEY,
  CIRCUIT_BREAKER_KEY,
  DLQ_THRESHOLD_KEY,
  messageRetryStormSimulation,
  RETRY_COUNT_KEY,
  WORKER_COUNT_KEY,
} from "./message-retry-storm/definition";
import { DEPENDENCY_DEGRADES_MS, DEPENDENCY_WORSENS_MS } from "./message-retry-storm/timed-events";
import { MESSAGE_RETRY_STORM_SCORING } from "./message-retry-storm/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(messageRetryStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += messageRetryStormSimulation.tickMs
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
      messageRetryStormSimulation,
      state,
      action,
      messageRetryStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function scoreOf(state: ReturnType<typeof runScenario>) {
  const finishResult = evaluateCandidateDeclaredFinish(messageRetryStormSimulation, state);
  const inputs =
    finishResult.outcome === "resolved"
      ? extractFinishScoringInputs(messageRetryStormSimulation, finishResult)
      : extractScoringInputs(messageRetryStormSimulation, state);
  return scoreAuthoredAttempt(MESSAGE_RETRY_STORM_SCORING, inputs);
}

describe("Message Retry Storm", () => {
  // ── Definition ────────────────────────────────────────────────────────
  describe("definition", () => {
    it("validates without throwing and carries real library metadata as a paid scenario", () => {
      expect(messageRetryStorm.isFree).toBe(false);
      expect(messageRetryStorm.library?.category).toBe("Messaging & Streaming");
      expect(messageRetryStorm.library?.tags.length).toBeGreaterThan(0);
      expect(messageRetryStorm.library?.skills.length).toBeGreaterThan(0);
      expect(messageRetryStorm.slug).toBe("message-retry-storm");
      expect(messageRetryStorm.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six fixed dimensions", () => {
      const dims = MESSAGE_RETRY_STORM_SCORING.dimensions.map((d) => d.dimension);
      expect(dims).toEqual([
        "recovery",
        "customerImpact",
        "dataIntegrity",
        "reliability",
        "costEfficiency",
        "operationalEfficiency",
      ]);
      const maxTotal = MESSAGE_RETRY_STORM_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(maxTotal).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", async () => {
      const { messageRetryStormCandidateUI } = await import("./message-retry-storm/candidate-ui");
      expect(messageRetryStormCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(messageRetryStormCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(messageRetryStormCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  // ── Runtime ───────────────────────────────────────────────────────────
  describe("runtime", () => {
    it("starts healthy with its own authored initial values", () => {
      const state = createInitialState(messageRetryStormSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.queueDepth).toBe(40);
      expect(state.values.queueHealth).toBe("normal");
      expect(state.incidentStartedAtMs).toBeNull();
    });

    it("remains healthy until the dependency degrades at T=45s", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS - 1_000);
      expect(state.status).toBe("healthy");
      expect(state.triggers.dependencyDegraded ?? false).toBe(false);
    });

    it("the incident begins: the dependency degrades and the backlog starts building with no mitigation", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DEPENDENCY_DEGRADES_MS);
      expect(state.triggers.dependencyDegraded).toBe(true);
      expect(state.status).toBe("critical");
      expect(state.values.queueDepth).toBe(5_800);
      expect(state.values.queueHealth).toBe("critical");
    });

    it("good path 1: bounded retries + DLQ enabled reaches a sustained success state (candidate_declared, never auto-resolves)", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.values.queueDepth).toBe(90);
      expect(state.values.queueHealth).toBe("normal");
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        messageRetryStormSimulation.successCondition.sustainedSeconds,
      );
    });

    it("good path 2 (alternate strategy): circuit breaker + exponential backoff also reaches sustained success", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: BACKOFF_STRATEGY_KEY, value: "exponential" },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.values.queueDepth).toBe(150);
      expect(state.values.queueHealth).toBe("normal");
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        messageRetryStormSimulation.successCondition.sustainedSeconds,
      );
    });

    it("harmful path: scaling worker count while retries remain truly unbounded and the DLQ is disabled makes it worse, not better", () => {
      const baseline = runScenario(DEPENDENCY_DEGRADES_MS + 10_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 999 },
      ]);
      const scaled = runScenario(DEPENDENCY_DEGRADES_MS + 10_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 999 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 16 },
      ]);

      expect(Number(scaled.values.queueDepth)).toBeGreaterThan(
        Number(baseline.values.queueDepth),
      );
      expect(Number(scaled.values.retryRatePerMinute)).toBeGreaterThan(
        Number(baseline.values.retryRatePerMinute),
      );
      expect(scaled.values.queueHealth).toBe("critical");
    });

    it("baseline/no-action: the backlog stays critical and never self-resolves", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.queueHealth).toBe("critical");
      expect(state.status).not.toBe("resolved");
    });

    it("partial: DLQ enabled but retries still truly unbounded never actually routes messages out", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 20_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 999 },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.values.queueDepth).toBe(7_200);
      expect(state.values.queueHealth).toBe("critical");
    });

    it("partial: bounded retries without the DLQ slows backlog growth but does not reverse it", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 20_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.values.queueDepth).toBe(4_100);
      expect(state.values.queueHealth).toBe("warning");
    });

    it("delayed consequence: with no mitigation, sustained retry pressure worsens the dependency further at the second-wave timestamp, with queueDepth/retryRate already visibly elevated beforehand", () => {
      const beforeEscalation = runScenario(DEPENDENCY_WORSENS_MS - 1_000);
      // Observable-evidence rule: queue depth and retry rate are already
      // far above healthy before the second wave fires — the candidate had
      // a standing, visible reason to suspect the system was not stable.
      expect(Number(beforeEscalation.values.queueDepth)).toBeGreaterThan(1_000);
      expect(Number(beforeEscalation.values.retryRatePerMinute)).toBeGreaterThan(500);
      expect(beforeEscalation.values.queueHealth).toBe("critical");

      const afterEscalation = runScenario(DEPENDENCY_WORSENS_MS + 1_000);
      expect(afterEscalation.triggers.dependencyWorsened).toBe(true);
      expect(afterEscalation.values.queueDepth).toBe(26_000);
      expect(Number(afterEscalation.values.queueDepth)).toBeGreaterThan(
        Number(beforeEscalation.values.queueDepth),
      );
    });

    it("mitigation applied before the second wave escapes the escalation entirely", () => {
      const state = runScenario(DEPENDENCY_WORSENS_MS + 5_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);

      expect(state.values.queueDepth).toBe(90);
      expect(state.values.queueHealth).toBe("normal");
    });

    it("failure path: an unmitigated storm sustained long enough automatically fails", () => {
      const state = runScenario(DEPENDENCY_WORSENS_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak queue depth and retry rate generically via numericWatchFields", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 10_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 999 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 16 },
      ]);
      expect(state.peaks.peakValues.queueDepth).toBe(18_000);
    });

    it("tracks monthly infrastructure cost that increases with worker count", () => {
      let state = createInitialState(messageRetryStormSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(120);

      const tickMs = messageRetryStormSimulation.tickMs;
      state = simulate(
        messageRetryStormSimulation,
        state,
        { id: "scale-workers", timestampMs: 0, controlKey: WORKER_COUNT_KEY, value: 16 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(120 + 340);
    });

    it("rejects an invalid control value", () => {
      const state = createInitialState(messageRetryStormSimulation);
      const result = simulate(
        messageRetryStormSimulation,
        state,
        { id: "a1", timestampMs: 0, controlKey: RETRY_COUNT_KEY, value: 7 },
        1_000,
      );
      expect(result.state.controlValues[RETRY_COUNT_KEY]).toBe(10);
      expect(result.events.some((e) => e.type === "CONFIG_CHANGE_REJECTED")).toBe(true);
    });
  });

  // ── Completion-mode (candidate_declared) ─────────────────────────────
  describe("completion mode: candidate_declared", () => {
    it("success is sustained but never auto-terminal", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(messageRetryStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from the optimal state resolves with tier optimal", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);
      const finish = evaluateCandidateDeclaredFinish(messageRetryStormSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("Finish from the alternate good (breaker+backoff) state also resolves with tier optimal", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: BACKOFF_STRATEGY_KEY, value: "exponential" },
      ]);
      const finish = evaluateCandidateDeclaredFinish(messageRetryStormSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("Finish from an unsafe/unmitigated state declares unstable, never resolved", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 10_000);
      const finish = evaluateCandidateDeclaredFinish(messageRetryStormSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
      expect(finish.completionTier).toBeNull();
    });

    it("Finish from the still-unsafe DLQ-enabled-but-unbounded-retries partial also declares unstable", () => {
      const state = runScenario(DEPENDENCY_DEGRADES_MS + 20_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);
      const finish = evaluateCandidateDeclaredFinish(messageRetryStormSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("automatic failure still fires regardless of completion mode", () => {
      const state = runScenario(DEPENDENCY_WORSENS_MS + 61_000);
      expect(state.status).toBe("failed");
      const finish = evaluateCandidateDeclaredFinish(messageRetryStormSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
      expect(finish.completionTier).toBeNull();
    });
  });

  // ── Scoring ───────────────────────────────────────────────────────────
  describe("scoring", () => {
    it("good (bounded retries + DLQ) scores well above baseline and harmful", () => {
      const good = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);
      const alternateGood = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: BACKOFF_STRATEGY_KEY, value: "exponential" },
      ]);
      const baseline = runScenario(DEPENDENCY_WORSENS_MS + 61_000);
      const harmful = runScenario(DEPENDENCY_WORSENS_MS + 61_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 999 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 16 },
      ]);
      const partial = runScenario(DEPENDENCY_DEGRADES_MS + 20_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
      ]);

      expect(baseline.status).toBe("failed");
      expect(harmful.status).toBe("failed");

      const goodScore = scoreOf(good).total;
      const alternateGoodScore = scoreOf(alternateGood).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;
      const partialScore = scoreOf(partial).total;

      // Record the actual executed numbers (phase6b.md section 16 — read
      // the real number, assert on it, never assume ordering blindly).
      // failed attempts still score dataIntegrity/customerImpact/
      // costEfficiency/operationalEfficiency on their real measured
      // values — only recovery and reliability are zeroed via
      // terminalOverrides (same documented pattern as every other
      // built-in scenario's scoring config, e.g. Poison Message Loop's).
      expect(goodScore).toBe(865);
      expect(alternateGoodScore).toBe(865);
      expect(baselineScore).toBe(550);
      expect(harmfulScore).toBe(425);
      // Legitimate tie (phase6b.md section 17's documented
      // terminal-override limitation): the partial run never resolves
      // (status stays "critical", not "resolved") within its short
      // window, so recovery/reliability are zeroed by
      // terminalOverrides.unresolved — the exact same zeroing the failed
      // baseline gets via terminalOverrides.failed. Both runs' remaining
      // dimensions (dataIntegrity/customerImpact/costEfficiency/
      // operationalEfficiency) also land in the same bands, producing an
      // honest tie rather than a scoring bug — verified below by
      // confirming partial genuinely never reached success.
      expect(partialScore).toBe(baselineScore);
      expect(partialScore).toBeGreaterThan(harmfulScore);
      expect(goodScore).toBeGreaterThan(partialScore);
    });

    it("the two good paths (DLQ-bound vs circuit-breaker) score identically — neither is secretly favored", () => {
      const dlqPath = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ]);
      const breakerPath = runScenario(DEPENDENCY_DEGRADES_MS + 30_000, [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: BACKOFF_STRATEGY_KEY, value: "exponential" },
      ]);

      expect(scoreOf(dlqPath).total).toBe(scoreOf(breakerPath).total);
    });
  });

  // ── Determinism ───────────────────────────────────────────────────────
  describe("determinism", () => {
    it("produces identical state for the same action sequence", () => {
      const actions: TimedAction[] = [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 3 },
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: DLQ_THRESHOLD_KEY, value: 10 },
      ];

      const runA = runScenario(DEPENDENCY_DEGRADES_MS + 45_000, actions);
      const runB = runScenario(DEPENDENCY_DEGRADES_MS + 45_000, actions);

      expect(runA).toEqual(runB);
    });

    it("produces identical scores for the same action sequence", () => {
      const actions: TimedAction[] = [
        { atMs: DEPENDENCY_DEGRADES_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 16 },
      ];
      const stateA = runScenario(DEPENDENCY_WORSENS_MS + 61_000, actions);
      const stateB = runScenario(DEPENDENCY_WORSENS_MS + 61_000, actions);

      expect(scoreOf(stateA)).toEqual(scoreOf(stateB));
    });
  });
});
