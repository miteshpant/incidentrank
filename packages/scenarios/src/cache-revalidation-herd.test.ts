import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cacheRevalidationHerd } from "./cache-revalidation-herd";
import {
  API_INSTANCE_COUNT_KEY,
  cacheRevalidationHerdSimulation,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  TTL_JITTER_ENABLED_KEY,
} from "./cache-revalidation-herd/definition";
import { cacheRevalidationHerdCandidateUI } from "./cache-revalidation-herd/candidate-ui";
import { CACHE_REVALIDATION_HERD_SCORING } from "./cache-revalidation-herd/scoring";
import { extractScoringInputs } from "@incidentrank/simulator";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cacheRevalidationHerdSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cacheRevalidationHerdSimulation.tickMs
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
      cacheRevalidationHerdSimulation,
      state,
      action,
      cacheRevalidationHerdSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const EXPIRY_APPROACHING_MS = 20_000;
const SYNCHRONIZED_EXPIRY_MS = 35_000;
const RETRY_AMPLIFICATION_MS = SYNCHRONIZED_EXPIRY_MS + 60_000;

describe("Cache Revalidation Herd", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(cacheRevalidationHerd.isFree).toBe(false);
      expect(cacheRevalidationHerd.library?.category).toBe("API & Traffic");
      expect(cacheRevalidationHerd.library?.tags.length).toBeGreaterThan(0);
      expect(cacheRevalidationHerd.library?.skills.length).toBeGreaterThan(0);
      expect(cacheRevalidationHerd.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = CACHE_REVALIDATION_HERD_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        [
          "recovery",
          "customerImpact",
          "dataIntegrity",
          "reliability",
          "costEfficiency",
          "operationalEfficiency",
        ].sort(),
      );
      const totalMax = CACHE_REVALIDATION_HERD_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(cacheRevalidationHerdCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(cacheRevalidationHerdCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(cacheRevalidationHerdCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(cacheRevalidationHerdSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.originQps).toBe(80);
      expect(state.values.revalidationMode).toBe("unresolved");
    });

    it("observable precursor: miss rate and concurrent refreshes climb before the synchronized expiry lands", () => {
      const state = runScenario(EXPIRY_APPROACHING_MS + 1_000);
      expect(state.values.cacheMissRatePct).toBe(18);
      expect(state.values.concurrentRefreshes).toBe(40);
      expect(state.values.originStatus).toBe("warning");
      // The incident has not fully started (no herd yet) — only the
      // precursor trigger has fired.
    });

    it("synchronized expiry triggers the herd baseline incident", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 1_000);
      expect(state.incidentStartedAtMs).not.toBeNull();
      expect(state.status).toBe("critical");
      expect(state.values.originQps).toBe(5_400);
      expect(state.values.originStatus).toBe("critical");
    });

    it("strong path (jitter): resolves regardless of other controls", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 25_000, [
        { atMs: EXPIRY_APPROACHING_MS + 1_000, controlKey: TTL_JITTER_ENABLED_KEY, value: true },
      ]);
      expect(state.values.originQps).toBe(90);
      expect(state.values.originStatus).toBe("normal");
      expect(state.values.revalidationMode).toBe("jittered");
    });

    it("alternate good path (single-flight coalescing): collapses the herd into one refresh per key", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: SINGLE_FLIGHT_COALESCING_KEY, value: true },
      ]);
      expect(state.values.originQps).toBe(95);
      expect(state.values.concurrentRefreshes).toBe(1);
      expect(state.values.originStatus).toBe("normal");
      expect(state.values.revalidationMode).toBe("coalesced");
    });

    it("alternate good path (stale-while-revalidate): never blocks callers on a synchronous refresh", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000, [
        {
          atMs: SYNCHRONIZED_EXPIRY_MS + 1_000,
          controlKey: STALE_WHILE_REVALIDATE_ENABLED_KEY,
          value: true,
        },
      ]);
      expect(state.values.originQps).toBe(85);
      expect(state.values.apiLatencyMs).toBe(41);
      expect(state.values.originStatus).toBe("normal");
      expect(state.values.revalidationMode).toBe("stale-served");
    });

    it("harmful path: scaling the API fleet while unmitigated makes origin load WORSE than baseline", () => {
      const baseline = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000);
      const scaled = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 24 },
      ]);

      expect(scaled.values.originQps).toBeGreaterThan(baseline.values.originQps as number);
      expect(scaled.values.concurrentRefreshes).toBeGreaterThan(
        baseline.values.concurrentRefreshes as number,
      );
      expect(scaled.values.originStatus).toBe("critical");
    });

    it("harmful path: shortening retry backoff amplifies retries and worsens origin load vs baseline", () => {
      const baseline = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000);
      const shortBackoff = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: REFRESH_RETRY_BACKOFF_KEY, value: 200 },
      ]);

      expect(shortBackoff.values.originQps).toBeGreaterThan(baseline.values.originQps as number);
      expect(shortBackoff.values.refreshFailureRatePct).toBeGreaterThan(
        baseline.values.refreshFailureRatePct as number,
      );
    });

    it("real-but-incomplete path: raising refresh concurrency limit alone masks symptoms without fixing duplicate refreshers", () => {
      const baseline = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000);
      const concurrencyRaised = runScenario(SYNCHRONIZED_EXPIRY_MS + 5_000, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: REFRESH_CONCURRENCY_LIMIT_KEY, value: 400 },
      ]);

      // Improves vs. doing nothing...
      expect(concurrencyRaised.values.originQps).toBeLessThan(baseline.values.originQps as number);
      // ...but never reaches the genuinely safe steady-state the three
      // real fixes reach, and origin stays in a non-normal status.
      expect(concurrencyRaised.values.originStatus).not.toBe("normal");
      expect(concurrencyRaised.values.originQps).toBeGreaterThan(1_000);
      expect(concurrencyRaised.values.revalidationMode).toBe("masked");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 30_000);
      expect(state.status).toBe("critical");
      expect(state.values.originStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated herd load produces retry amplification on a second wave", () => {
      const beforeSecondWave = runScenario(SYNCHRONIZED_EXPIRY_MS + 30_000);
      // Observable precursor already visible before the second wave:
      // refresh failure rate and origin QPS are already elevated.
      expect(beforeSecondWave.values.refreshFailureRatePct).toBeGreaterThanOrEqual(30);
      expect(beforeSecondWave.values.originQps).toBeGreaterThan(1_000);

      const afterSecondWave = runScenario(RETRY_AMPLIFICATION_MS + 5_000);
      expect(afterSecondWave.values.originQps).toBe(7_200);
      expect(afterSecondWave.values.refreshFailureRatePct).toBe(65);
    });

    it("fails if origin QPS stays at or above 9,000 for the full sustained window", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 1_000 + 46_000, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 24 },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak origin QPS and peak concurrent refreshes generically via numericWatchFields", () => {
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 1_000);
      expect(state.peaks.peakValues.originQps).toBe(5_400);
      expect(state.peaks.peakValues.concurrentRefreshes).toBe(620);
    });

    it("tracks monthly infrastructure cost that increases with both API instances and refresh concurrency", () => {
      let state = createInitialState(cacheRevalidationHerdSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = cacheRevalidationHerdSimulation.tickMs;
      state = simulate(
        cacheRevalidationHerdSimulation,
        state,
        { id: "scale-fleet", timestampMs: 0, controlKey: API_INSTANCE_COUNT_KEY, value: 48 },
        tickMs,
      ).state;
      state = simulate(
        cacheRevalidationHerdSimulation,
        state,
        { id: "scale-concurrency", timestampMs: tickMs, controlKey: REFRESH_CONCURRENCY_LIMIT_KEY, value: 400 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 1_300 + 320);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: SINGLE_FLIGHT_COALESCING_KEY, value: true },
      ];
      const runA = runScenario(SYNCHRONIZED_EXPIRY_MS + 10_000, actions);
      const runB = runScenario(SYNCHRONIZED_EXPIRY_MS + 10_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Immediate-Finish audit (automatic mode: zero-action immediate resolution check)", () => {
    it("zero actions at incident start does not satisfy successCondition — the herd is still forming/active", () => {
      // Automatic mode has no Finish button at all — a candidate cannot
      // declare completion. The relevant audit here is: does the engine
      // itself auto-resolve immediately/trivially with zero candidate
      // action? It must not — the herd's own baseline state is critical
      // and stays critical until a real fix is applied.
      const state = runScenario(SYNCHRONIZED_EXPIRY_MS + 1_000);
      expect(state.status).not.toBe("resolved");
      expect(state.values.originStatus).toBe("critical");
      expect(state.values.originQps).toBeGreaterThan(150);
    });
  });

  describe("Scoring", () => {
    it("scores good (jitter), alternate-good (coalescing), baseline, and harmful (scaled fleet) paths with coherent ordering", () => {
      const goodState = runScenario(SYNCHRONIZED_EXPIRY_MS + 25_000, [
        { atMs: EXPIRY_APPROACHING_MS + 1_000, controlKey: TTL_JITTER_ENABLED_KEY, value: true },
      ]);
      // The engine itself never auto-writes "resolved" (Phase 7.1
      // doctrine) — score via the Finish-declaration derivation, never a
      // raw extractScoringInputs call on the unresolved state.
      const goodFinish = evaluateCandidateDeclaredFinish(cacheRevalidationHerdSimulation, goodState);
      expect(goodFinish.outcome).toBe("resolved");
      const goodScore = scoreAuthoredAttempt(
        CACHE_REVALIDATION_HERD_SCORING,
        extractFinishScoringInputs(cacheRevalidationHerdSimulation, goodFinish),
      );

      const alternateGoodState = runScenario(SYNCHRONIZED_EXPIRY_MS + 25_000, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: SINGLE_FLIGHT_COALESCING_KEY, value: true },
      ]);
      const alternateGoodFinish = evaluateCandidateDeclaredFinish(
        cacheRevalidationHerdSimulation,
        alternateGoodState,
      );
      expect(alternateGoodFinish.outcome).toBe("resolved");
      const alternateGoodScore = scoreAuthoredAttempt(
        CACHE_REVALIDATION_HERD_SCORING,
        extractFinishScoringInputs(cacheRevalidationHerdSimulation, alternateGoodFinish),
      );

      const unmitigatedWindowMs = SYNCHRONIZED_EXPIRY_MS + 3 * 60_000;

      const baselineState = runScenario(unmitigatedWindowMs);
      const baselineScore = scoreAuthoredAttempt(
        CACHE_REVALIDATION_HERD_SCORING,
        extractScoringInputs(cacheRevalidationHerdSimulation, baselineState),
      );

      const harmfulState = runScenario(unmitigatedWindowMs, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 24 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        CACHE_REVALIDATION_HERD_SCORING,
        extractScoringInputs(cacheRevalidationHerdSimulation, harmfulState),
      );

      const maskedState = runScenario(unmitigatedWindowMs, [
        { atMs: SYNCHRONIZED_EXPIRY_MS + 1_000, controlKey: REFRESH_CONCURRENCY_LIMIT_KEY, value: 400 },
      ]);
      const maskedScore = scoreAuthoredAttempt(
        CACHE_REVALIDATION_HERD_SCORING,
        extractScoringInputs(cacheRevalidationHerdSimulation, maskedState),
      );

      // Both optimal paths (jitter desynchronizing expiry at the source;
      // single-flight coalescing collapsing the herd into one refresh
      // per key) reach the exact same successCondition equally fast in
      // this test, so they legitimately tie at a perfect 1000 — there is
      // no dataIntegrity-style distinguishing tradeoff between them (see
      // definition.ts's completion-mode audit: both are fully durable,
      // neither sacrifices a feature or accepts a named cost the way
      // Missing Database Index's acceptable tier does).
      expect(goodScore.total).toBe(1000);
      expect(alternateGoodScore.total).toBe(1000);
      // Masked (refresh concurrency raised alone) is a real, if
      // incomplete, improvement over doing nothing: it never resolves
      // (recovery/reliability both zero out via terminalOverrides on
      // the unresolved outcome, same as baseline and harmful), but its
      // lower peak/realized revenue loss and smaller critical-time
      // footprint place it above baseline on customerImpact, and it
      // must never score below baseline or at/below the harmful path.
      expect(maskedScore.total).toBe(480);
      expect(baselineScore.total).toBe(430);
      expect(harmfulScore.total).toBe(320);

      expect(goodScore.total).toEqual(alternateGoodScore.total);
      expect(goodScore.total).toBeGreaterThan(maskedScore.total);
      expect(maskedScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
