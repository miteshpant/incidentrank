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
import { apiTrafficSpike } from "./api-traffic-spike";
import {
  API_INSTANCE_COUNT_KEY,
  apiTrafficSpikeSimulation,
  CACHE_BEHAVIOR_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
  RATE_LIMIT_MODE_KEY,
  REQUEST_QUEUE_MODE_KEY,
} from "./api-traffic-spike/definition";
import { apiTrafficSpikeCandidateUI } from "./api-traffic-spike/candidate-ui";
import { API_TRAFFIC_SPIKE_SCORING } from "./api-traffic-spike/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(apiTrafficSpikeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += apiTrafficSpikeSimulation.tickMs
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

    const result = simulate(apiTrafficSpikeSimulation, state, action, apiTrafficSpikeSimulation.tickMs);
    state = result.state;
  }

  return state;
}

const TRAFFIC_SPIKE_MS = 30_000;
const POOL_SATURATION_MS = TRAFFIC_SPIKE_MS + 3 * 60_000;

describe("API Traffic Spike", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(apiTrafficSpike.isFree).toBe(false);
      expect(apiTrafficSpike.library?.category).toBe("API & Traffic");
      expect(apiTrafficSpike.library?.tags.length).toBeGreaterThan(0);
      expect(apiTrafficSpike.library?.skills.length).toBeGreaterThan(0);
      expect(apiTrafficSpike.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = API_TRAFFIC_SPIKE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = API_TRAFFIC_SPIKE_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(apiTrafficSpikeCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(apiTrafficSpikeCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(apiTrafficSpikeCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(apiTrafficSpikeSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.dbConnectionUtilization).toBe(18);
      expect(state.values.trafficSpikeHealth).toBe("unresolved");
    });

    it("traffic spike triggers the baseline incident with a cold cache and rising DB pressure", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(TRAFFIC_SPIKE_MS);
      expect(state.status).toBe("degraded");
      expect(state.values.cacheHitRatePct).toBe(35);
      expect(state.values.dbConnectionUtilization).toBe(82);
      expect(state.values.dbStatus).toBe("warning");
    });

    it("strong path A: fixing both DB protection and cache behavior resolves the incident", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: DB_PROTECTION_MODE_KEY, value: "strict" },
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(22);
      expect(state.values.cacheHitRatePct).toBe(94);
      expect(state.values.trafficSpikeHealth).toBe("protected");
      expect(state.values.dbStatus).toBe("normal");
    });

    it("strong path B (alternate good): fixing cache behavior alone also resolves the incident", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(26);
      expect(state.values.trafficSpikeHealth).toBe("protected");
      expect(state.values.dbStatus).toBe("normal");
    });

    it("harmful path: scaling API instances while the cache is cold makes DB connection utilization worse than baseline", () => {
      const baseline = runScenario(TRAFFIC_SPIKE_MS + 20_000);
      const scaled = runScenario(TRAFFIC_SPIKE_MS + 20_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);

      expect(scaled.values.dbConnectionUtilization).toBeGreaterThan(
        baseline.values.dbConnectionUtilization as number,
      );
      expect(scaled.values.dbStatus).toBe("critical");
      expect(scaled.values.cacheHitRatePct).toBeLessThan(baseline.values.cacheHitRatePct as number);
    });

    it("harmful path: widening the DB connection pool alone also worsens DB pressure rather than fixing it", () => {
      const baseline = runScenario(TRAFFIC_SPIKE_MS + 20_000);
      const widened = runScenario(TRAFFIC_SPIKE_MS + 20_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: DB_CONNECTION_POOL_SIZE_KEY, value: 200 },
      ]);

      expect(widened.values.dbConnectionUtilization).toBeGreaterThan(
        baseline.values.dbConnectionUtilization as number,
      );
      expect(widened.values.dbStatus).toBe("critical");
    });

    it("baseline (no action) stays degraded and never self-resolves", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 60_000);
      expect(state.status).toBe("degraded");
      expect(state.values.dbStatus).toBe("warning");
    });

    it("delayed consequence: sustained unmitigated load saturates the connection pool on a second wave, with a visible precursor beforehand", () => {
      const beforeSecondWave = runScenario(TRAFFIC_SPIKE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.dbConnectionUtilization).toBeGreaterThanOrEqual(80);
      expect(beforeSecondWave.values.cacheHitRatePct).toBeLessThanOrEqual(40);

      const afterSecondWave = runScenario(POOL_SATURATION_MS + 5_000);
      expect(afterSecondWave.values.dbConnectionUtilization).toBe(99);
      expect(afterSecondWave.values.dbStatus).toBe("critical");
    });

    it("acceptable path: DB protection alone keeps the database safe but the cache never recovers", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 20_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: DB_PROTECTION_MODE_KEY, value: "strict" },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(58);
      expect(state.values.dbStatus).toBe("warning");
      expect(state.values.cacheHitRatePct).toBe(48);
      expect(state.values.trafficSpikeHealth).toBe("unresolved");
    });

    it("acceptable path: rate limiting throttles legitimate traffic but stabilizes the system", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 20_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: RATE_LIMIT_MODE_KEY, value: "on" },
      ]);
      expect(state.values.requestRatePerSec).toBe(1_100);
      expect(state.values.dbConnectionUtilization).toBe(30);
      expect(state.values.errorRatePct).toBeGreaterThan(0);
      expect(state.values.dbStatus).toBe("normal");
    });

    it("acceptable path: disabling the non-critical endpoint recovers every metric but marks the feature disabled, not fixed", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 20_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: NON_CRITICAL_ENDPOINT_ENABLED_KEY, value: false },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(28);
      expect(state.values.dbStatus).toBe("normal");
      expect(state.values.trafficSpikeHealth).toBe("feature-disabled");
    });

    it("partial path: bounding the request queue alone gives relief but stays degraded", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 20_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: REQUEST_QUEUE_MODE_KEY, value: "bounded" },
      ]);
      expect(state.values.dbConnectionUtilization).toBe(86);
      expect(state.values.dbStatus).toBe("warning");
      expect(state.values.trafficSpikeHealth).toBe("unresolved");
    });

    it("fails if DB connection utilization stays at or above 95% for the full sustained window", () => {
      const state = runScenario(POOL_SATURATION_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak DB connection utilization and peak queue depth generically via numericWatchFields", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 1_000);
      expect(state.peaks.peakValues.dbConnectionUtilization).toBe(82);
      expect(state.peaks.peakValues.requestQueueDepth).toBe(90);
    });

    it("tracks monthly infrastructure cost that increases with both API instances and pool size", () => {
      let state = createInitialState(apiTrafficSpikeSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = apiTrafficSpikeSimulation.tickMs;
      state = simulate(
        apiTrafficSpikeSimulation,
        state,
        { id: "scale-api", timestampMs: 0, controlKey: API_INSTANCE_COUNT_KEY, value: 32 },
        tickMs,
      ).state;
      state = simulate(
        apiTrafficSpikeSimulation,
        state,
        { id: "scale-pool", timestampMs: tickMs, controlKey: DB_CONNECTION_POOL_SIZE_KEY, value: 200 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 1_200 + 380);
    });
  });

  describe("Phase 6.1: two-tier completion — protected (optimal) vs load-shed (acceptable)", () => {
    it("both fixes applied, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: DB_PROTECTION_MODE_KEY, value: "strict" },
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiTrafficSpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("cache fix alone, sustained, is also eligible for an OPTIMAL-tier Finish (alternate good path)", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiTrafficSpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("rate limiting, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: RATE_LIMIT_MODE_KEY, value: "on" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiTrafficSpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("endpoint disabled, sustained, is eligible for an ACCEPTABLE-tier Finish", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: NON_CRITICAL_ENDPOINT_ENABLED_KEY, value: false },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiTrafficSpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("DB protection alone, sustained, is eligible for an ACCEPTABLE-tier Finish", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: DB_PROTECTION_MODE_KEY, value: "strict" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiTrafficSpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("bounded request queue alone remains ineligible for any Finish tier", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: REQUEST_QUEUE_MODE_KEY, value: "bounded" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiTrafficSpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        apiTrafficSpikeSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: RATE_LIMIT_MODE_KEY, value: "on" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        apiTrafficSpikeSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      const result = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: NON_CRITICAL_ENDPOINT_ENABLED_KEY, value: false },
      ]);
      const result = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(TRAFFIC_SPIKE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(POOL_SATURATION_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at T=0 does not resolve prematurely", () => {
      // Before the incident even starts, the healthy-default rule trivially
      // satisfies both successCondition and acceptableCondition's
      // non-sustain-window conditions — but neither has accrued any
      // consecutive seconds yet, so Finish at T=0 must be declared_unstable.
      const state = createInitialState(apiTrafficSpikeSimulation);
      expect(state.transitions.consecutiveSuccessSeconds).toBe(0);
      expect(state.transitions.consecutiveAcceptableSeconds).toBe(0);
      const result = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ];
      const runA = runScenario(TRAFFIC_SPIKE_MS + 40_000, actions);
      const runB = runScenario(TRAFFIC_SPIKE_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good, acceptable, baseline, and harmful paths with coherent ordering", () => {
      const goodState = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: CACHE_BEHAVIOR_KEY, value: "extendedTtl" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        API_TRAFFIC_SPIKE_SCORING,
        extractFinishScoringInputs(apiTrafficSpikeSimulation, goodFinish),
      );

      const acceptableState = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: NON_CRITICAL_ENDPOINT_ENABLED_KEY, value: false },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(apiTrafficSpikeSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        API_TRAFFIC_SPIKE_SCORING,
        extractFinishScoringInputs(apiTrafficSpikeSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(TRAFFIC_SPIKE_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        API_TRAFFIC_SPIKE_SCORING,
        extractScoringInputs(apiTrafficSpikeSimulation, baselineState),
      );

      const harmfulState = runScenario(TRAFFIC_SPIKE_MS + 40_000, [
        { atMs: TRAFFIC_SPIKE_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        API_TRAFFIC_SPIKE_SCORING,
        extractScoringInputs(apiTrafficSpikeSimulation, harmfulState),
      );

      // Immediate zero-action Finish: never eligible, so scored as an
      // unresolved attempt via the same terminal-override path.
      const immediateState = createInitialState(apiTrafficSpikeSimulation);
      const immediateScore = scoreAuthoredAttempt(
        API_TRAFFIC_SPIKE_SCORING,
        extractScoringInputs(apiTrafficSpikeSimulation, immediateState),
      );

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
      expect(baselineScore.total).toBe(immediateScore.total);

      // Pin exact executed totals (phase6c.md section 17's "run it, read
      // the real number" requirement).
      //
      // GOOD = 1000 (recovery 300, customerImpact 200, dataIntegrity 200,
      // reliability 150, costEfficiency 100, operationalEfficiency 50):
      // the fix lands one tick after the spike starts, so recovery time,
      // revenue loss, and criticalTimeRatio all hit their best bands, and
      // dataIntegrity awards full marks for trafficSpikeHealth ===
      // "protected".
      //
      // ACCEPTABLE = 960 (same as GOOD except dataIntegrity 160): the
      // non-critical endpoint is disabled equally fast, so recovery/
      // customerImpact/reliability legitimately tie with the good path —
      // dataIntegrity is the dimension that correctly discriminates
      // "protected" from "feature-disabled" (phase6c.md section 17's
      // suspicious-tie investigation: this tie is real and expected, not
      // a scoring bug, because the generic engine's recovery/reliability
      // dimensions only measure HOW FAST the system stabilized, not BY
      // WHAT MEANS — dataIntegrity is deliberately the dimension that
      // measures the means).
      //
      // BASELINE = 510 and IMMEDIATE (zero-action Finish) = 510, both via
      // the unresolved terminal override (recovery=0, reliability=0;
      // customerImpact/dataIntegrity/costEfficiency/operationalEfficiency
      // have no terminal override and are measured on real, if
      // unresolved, state — this mirrors Missing Database Index's
      // baseline-scoring pattern exactly).
      //
      // HARMFUL (API scaled to 16) = 420: strictly below baseline, driven
      // by costEfficiency (the extra instances' infrastructure cost) and
      // operationalEfficiency's harmful-change penalty — exactly the
      // "harmful > strong mitigation" check phase6c.md section 17 flags
      // to investigate never fires here.
      expect(goodScore.total).toBe(1000);
      expect(acceptableScore.total).toBe(960);
      expect(baselineScore.total).toBe(510);
      expect(harmfulScore.total).toBe(420);
      expect(immediateScore.total).toBe(510);
    });
  });
});
