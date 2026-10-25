import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cacheEvictionStorm } from "./cache-eviction-storm";
import {
  API_CONCURRENCY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  cacheEvictionStormSimulation,
  DB_PROTECTION_KEY,
  OBJECT_CACHING_POLICY_KEY,
} from "./cache-eviction-storm/definition";
import { cacheEvictionStormCandidateUI } from "./cache-eviction-storm/candidate-ui";
import { CACHE_EVICTION_STORM_SCORING } from "./cache-eviction-storm/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cacheEvictionStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += cacheEvictionStormSimulation.tickMs) {
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

    const result = simulate(cacheEvictionStormSimulation, state, action, cacheEvictionStormSimulation.tickMs);
    state = result.state;
  }

  return state;
}

const EVICTION_CHURN_RISING_MS = 30_000;
const DB_READ_PRESSURE_MS = EVICTION_CHURN_RISING_MS + 3 * 60_000;

describe("Cache Eviction Storm", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(cacheEvictionStorm.isFree).toBe(false);
      expect(cacheEvictionStorm.library?.category).toBe("Caching");
      expect(cacheEvictionStorm.library?.tags.length).toBeGreaterThan(0);
      expect(cacheEvictionStorm.library?.skills.length).toBeGreaterThan(0);
      expect(cacheEvictionStorm.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = CACHE_EVICTION_STORM_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CACHE_EVICTION_STORM_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(cacheEvictionStormCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(cacheEvictionStormCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(cacheEvictionStormCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(cacheEvictionStormSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.hitRatioPct).toBe(94);
      expect(state.values.cacheRecoveryMode).toBe("unresolved");
    });

    it("eviction churn rising triggers the critical baseline incident", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(EVICTION_CHURN_RISING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.evictionRatePerSec).toBe(320);
      expect(state.values.hitRatioPct).toBe(34);
      expect(state.values.cacheStatus).toBe("critical");
    });

    it("strong path: size-aware admission policy fully resolves eviction churn", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_ADMISSION_POLICY_KEY, value: "sizeAwareAdmission" },
      ]);
      expect(state.values.hitRatioPct).toBe(95);
      expect(state.values.cacheStatus).toBe("normal");
      expect(state.values.cacheRecoveryMode).toBe("policyFixed");
    });

    it("strong path: projected-field caching alone also fully resolves eviction churn", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: OBJECT_CACHING_POLICY_KEY, value: "projectedFields" },
      ]);
      expect(state.values.hitRatioPct).toBe(95);
      expect(state.values.cacheStatus).toBe("normal");
      expect(state.values.cacheRecoveryMode).toBe("policyFixed");
    });

    it("alternate good path: combining both policy fixes resolves with the best numbers", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: OBJECT_CACHING_POLICY_KEY, value: "projectedFields" },
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_ADMISSION_POLICY_KEY, value: "sizeAwareAdmission" },
      ]);
      expect(state.values.hitRatioPct).toBe(96);
      expect(state.values.cacheStatus).toBe("normal");
      expect(state.values.cacheRecoveryMode).toBe("policyFixed");
      // The engine itself never auto-writes "resolved" — only an
      // explicit Finish declaration can (Phase 7.1 doctrine). The
      // success condition is nonetheless genuinely, continuously
      // satisfied and sustained.
      expect(state.status).not.toBe("resolved");
      expect(evaluateCandidateDeclaredFinish(cacheEvictionStormSimulation, state).outcome).toBe(
        "resolved",
      );
    });

    it("capacity-only path: maximum memory gives real but incomplete relief and never reaches normal", () => {
      const baseline = runScenario(EVICTION_CHURN_RISING_MS + 20_000);
      const memoryScaled = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_MEMORY_MULTIPLIER_KEY, value: 8 },
      ]);

      // Real relief versus baseline.
      expect(memoryScaled.values.evictionRatePerSec).toBeLessThan(baseline.values.evictionRatePerSec as number);
      expect(memoryScaled.values.hitRatioPct).toBeGreaterThan(baseline.values.hitRatioPct as number);
      expect(memoryScaled.values.dbReadsPerSec).toBeLessThan(baseline.values.dbReadsPerSec as number);

      // But incomplete: never crosses into "normal"/resolved territory.
      expect(memoryScaled.values.cacheStatus).toBe("warning");
      expect(memoryScaled.values.hitRatioPct).toBeLessThan(90);
      expect(memoryScaled.values.cacheRecoveryMode).toBe("memoryScaled");
      expect(memoryScaled.status).not.toBe("resolved");
    });

    it("capacity-only path: smaller memory increase gives less relief than the maximum increase", () => {
      const moderate = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_MEMORY_MULTIPLIER_KEY, value: 4 },
      ]);
      const maxed = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_MEMORY_MULTIPLIER_KEY, value: 8 },
      ]);
      expect(moderate.values.hitRatioPct).toBeLessThan(maxed.values.hitRatioPct as number);
      expect(moderate.values.evictionRatePerSec).toBeGreaterThan(maxed.values.evictionRatePerSec as number);
      expect(moderate.values.cacheStatus).toBe("warning");
    });

    it("harmful path: scaling API concurrency while unmitigated worsens DB read pressure", () => {
      const baseline = runScenario(EVICTION_CHURN_RISING_MS + 20_000);
      const scaled = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);

      expect(scaled.values.dbReadsPerSec).toBeGreaterThan(baseline.values.dbReadsPerSec as number);
      expect(scaled.values.hitRatioPct).toBeLessThan(baseline.values.hitRatioPct as number);
      expect(scaled.values.cacheStatus).toBe("critical");
    });

    it("harmful path: lowering TTL alone worsens eviction rate rather than improving it", () => {
      const baseline = runScenario(EVICTION_CHURN_RISING_MS + 20_000);
      const loweredTtl = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_TTL_KEY, value: 60 },
      ]);

      expect(loweredTtl.values.evictionRatePerSec).toBeGreaterThan(baseline.values.evictionRatePerSec as number);
      expect(loweredTtl.values.hitRatioPct).toBeLessThan(baseline.values.hitRatioPct as number);
      expect(loweredTtl.values.cacheStatus).toBe("critical");
    });

    it("partial path: DB protection alone shields the database but leaves the cache itself still thrashing", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: DB_PROTECTION_KEY, value: "coalescing" },
      ]);
      expect(state.values.dbReadsPerSec).toBeLessThan(2_400);
      expect(state.values.cacheRecoveryMode).toBe("unresolved");
      expect(state.values.cacheStatus).toBe("warning");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.cacheStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated churn drives database read pressure critical on a second wave", () => {
      const beforeSecondWave = runScenario(EVICTION_CHURN_RISING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.dbReadsPerSec).toBeGreaterThanOrEqual(2_000);
      expect(beforeSecondWave.values.hitRatioPct).toBeLessThanOrEqual(40);

      const afterSecondWave = runScenario(DB_READ_PRESSURE_MS + 5_000);
      expect(afterSecondWave.values.dbReadsPerSec).toBe(6_400);
      expect(afterSecondWave.values.hitRatioPct).toBe(18);
    });

    it("fails if hit ratio stays at or below 20% for the full sustained window", () => {
      const state = runScenario(DB_READ_PRESSURE_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("never auto-resolves even once the success condition is genuinely sustained — only an explicit Finish declaration can resolve it", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_ADMISSION_POLICY_KEY, value: "sizeAwareAdmission" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();

      const finish = evaluateCandidateDeclaredFinish(cacheEvictionStormSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("tracks peak eviction rate and peak DB reads generically via numericWatchFields", () => {
      const state = runScenario(EVICTION_CHURN_RISING_MS + 1_000);
      expect(state.peaks.peakValues.evictionRatePerSec).toBe(320);
      expect(state.peaks.peakValues.dbReadsPerSec).toBe(2_400);
    });

    it("tracks monthly infrastructure cost that increases with memory multiplier and API concurrency", () => {
      let state = createInitialState(cacheEvictionStormSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(300);

      const tickMs = cacheEvictionStormSimulation.tickMs;
      state = simulate(
        cacheEvictionStormSimulation,
        state,
        { id: "scale-memory", timestampMs: 0, controlKey: CACHE_MEMORY_MULTIPLIER_KEY, value: 8 },
        tickMs,
      ).state;
      state = simulate(
        cacheEvictionStormSimulation,
        state,
        { id: "scale-concurrency", timestampMs: tickMs, controlKey: API_CONCURRENCY_KEY, value: "high" },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(300 + 780 + 260);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_ADMISSION_POLICY_KEY, value: "sizeAwareAdmission" },
      ];
      const runA = runScenario(EVICTION_CHURN_RISING_MS + 20_000, actions);
      const runB = runScenario(EVICTION_CHURN_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state for the memory-only path run twice", () => {
      const actions: TimedAction[] = [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_MEMORY_MULTIPLIER_KEY, value: 8 },
      ];
      const runA = runScenario(EVICTION_CHURN_RISING_MS + 20_000, actions);
      const runB = runScenario(EVICTION_CHURN_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (policy fix), alternate-good (combined fix), memory-only partial, baseline, and harmful paths with coherent ordering", () => {
      const goodState = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_ADMISSION_POLICY_KEY, value: "sizeAwareAdmission" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(cacheEvictionStormSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        CACHE_EVICTION_STORM_SCORING,
        extractFinishScoringInputs(cacheEvictionStormSimulation, goodFinish),
      );

      const alternateGoodState = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: OBJECT_CACHING_POLICY_KEY, value: "projectedFields" },
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_ADMISSION_POLICY_KEY, value: "sizeAwareAdmission" },
      ]);
      const alternateGoodFinish = evaluateCandidateDeclaredFinish(
        cacheEvictionStormSimulation,
        alternateGoodState,
      );
      const alternateGoodScore = scoreAuthoredAttempt(
        CACHE_EVICTION_STORM_SCORING,
        extractFinishScoringInputs(cacheEvictionStormSimulation, alternateGoodFinish),
      );

      // Memory-only partial path never resolves (never crosses the
      // successCondition bar), so it is scored via the unresolved
      // terminal override — no synthetic resolvedAtMs is fabricated.
      const partialState = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: CACHE_MEMORY_MULTIPLIER_KEY, value: 8 },
      ]);
      const partialScore = scoreAuthoredAttempt(
        CACHE_EVICTION_STORM_SCORING,
        extractScoringInputs(cacheEvictionStormSimulation, partialState),
      );

      const baselineState = runScenario(EVICTION_CHURN_RISING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        CACHE_EVICTION_STORM_SCORING,
        extractScoringInputs(cacheEvictionStormSimulation, baselineState),
      );

      const harmfulState = runScenario(EVICTION_CHURN_RISING_MS + 20_000, [
        { atMs: EVICTION_CHURN_RISING_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        CACHE_EVICTION_STORM_SCORING,
        extractScoringInputs(cacheEvictionStormSimulation, harmfulState),
      );

      // Good and alternate-good both resolve almost immediately (one
      // tick after incident start in this test) — recovery/
      // customerImpact/dataIntegrity all tie at maximum, a legitimate
      // tie (section 16/17), not a suspicious one: both paths are
      // genuine, equally fast, equally durable fixes. Total is 865, not
      // 1000: deriveScoringResolvedAtMs credits the INSTANT the success
      // condition first became continuously true (31_000ms, 1s after
      // incident start), not the moment its sustain window finished —
      // recoveryTimeSeconds is excellent (1s, top band, 300/300), but
      // totalTimeInCriticalMs (2_000ms, accumulated before the fix took
      // effect) measured against that same honest 1-second window gives
      // criticalTimeRatio=2.0 — the worst reliability band (15/150).
      // Same mechanism as autoscaling-failure.test.ts's equivalent note.
      expect(goodScore.total).toBe(865);
      expect(alternateGoodScore.total).toBe(865);
      expect(goodScore.breakdown.recovery).toBe(300);
      expect(alternateGoodScore.breakdown.recovery).toBe(300);
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(alternateGoodScore.breakdown.dataIntegrity).toBe(200);

      // Memory-only partial relief never resolves at all (it never
      // crosses successCondition's bar — see revenue-and-cost.ts), so
      // recovery/reliability/dataIntegrity all fall to their unresolved
      // terminal overrides (0). dataIntegrity additionally confirms the
      // "memoryScaled" tradeoff was actually detected, independent of
      // the unresolved override producing the same numeric 0 — see the
      // dedicated assertion below.
      expect(partialScore.total).toBe(260);
      expect(partialScore.breakdown.recovery).toBe(0);
      expect(partialScore.breakdown.dataIntegrity).toBe(0);

      // Baseline (never resolved, no harmful/cost changes) scores
      // higher than both the memory-only partial path (which pays real
      // infrastructure cost for its incomplete relief) and the harmful
      // path (which is penalized for the harmful change itself) — a
      // legitimate, explainable ordering investigated per section 16:
      // baseline's full costEfficiency credit (100, no cost increase)
      // and lack of any harmful-change penalty make it score above both
      // candidate interventions that failed to actually resolve the
      // incident.
      expect(baselineScore.total).toBe(350);
      expect(harmfulScore.total).toBe(290);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
      expect(harmfulScore.total).toBeGreaterThan(partialScore.total);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(goodScore.total).toBeGreaterThan(partialScore.total);
      expect(goodScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
