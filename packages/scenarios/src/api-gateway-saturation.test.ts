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
import { apiGatewaySaturation } from "./api-gateway-saturation";
import {
  AUTH_MIDDLEWARE_MODE_KEY,
  apiGatewaySaturationSimulation,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
} from "./api-gateway-saturation/definition";
import { apiGatewaySaturationCandidateUI } from "./api-gateway-saturation/candidate-ui";
import { API_GATEWAY_SATURATION_SCORING } from "./api-gateway-saturation/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(apiGatewaySaturationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += apiGatewaySaturationSimulation.tickMs
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
      apiGatewaySaturationSimulation,
      state,
      action,
      apiGatewaySaturationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const TRAFFIC_GROWTH_MS = 30_000;

describe("API Gateway Saturation", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(apiGatewaySaturation.isFree).toBe(false);
      expect(apiGatewaySaturation.library?.category).toBe("API & Traffic");
      expect(apiGatewaySaturation.library?.tags.length).toBeGreaterThan(0);
      expect(apiGatewaySaturation.library?.skills.length).toBeGreaterThan(0);
      expect(apiGatewaySaturation.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = API_GATEWAY_SATURATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = API_GATEWAY_SATURATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(apiGatewaySaturationCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(apiGatewaySaturationCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(apiGatewaySaturationCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(apiGatewaySaturationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.gatewayCpuUtilization).toBe(14);
      expect(state.values.backendUtilization).toBe(10);
      expect(state.values.gatewaySaturationHealth).toBe("unresolved");
    });

    it("growing traffic triggers the gateway-saturation baseline incident", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(TRAFFIC_GROWTH_MS);
      expect(state.status).toBe("critical");
      expect(state.values.gatewayCpuUtilization).toBe(94);
      expect(state.values.backendUtilization).toBe(12);
      expect(state.values.gatewayStatus).toBe("critical");
    });

    it("strong path: connection reuse + simplified routing together resolve the overhead regardless of other controls", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(22);
      expect(state.values.gatewayStatus).toBe("normal");
      expect(state.values.gatewaySaturationHealth).toBe("fixed");
      expect(state.values.backendUtilization).toBe(11);
    });

    it("alternate good path: lightweight auth mode alone also resolves the overhead via a different mechanism", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "lightweight" },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(26);
      expect(state.values.gatewayStatus).toBe("normal");
      expect(state.values.gatewaySaturationHealth).toBe("fixed");
    });

    it("harmful/decoy path: scaling backend capacity alone does nothing for the gateway bottleneck", () => {
      const baseline = runScenario(TRAFFIC_GROWTH_MS + 20_000);
      const scaled = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: BACKEND_CAPACITY_KEY, value: 24 },
      ]);

      // Scaling backend capacity does not relieve the gateway's own
      // bottleneck — gateway CPU/queue/customer latency remain at
      // least as saturated as the unmitigated baseline (the decoy
      // rule's authored values are its own distinct critical state,
      // not required to be bit-identical to the baseline rule).
      expect(scaled.values.gatewayCpuUtilization).toBeGreaterThanOrEqual(
        baseline.values.gatewayCpuUtilization as number,
      );
      expect(scaled.values.gatewayQueueDepth).toBeGreaterThanOrEqual(
        baseline.values.gatewayQueueDepth as number,
      );
      expect(scaled.values.customerLatencyMs).toBeGreaterThanOrEqual(
        baseline.values.customerLatencyMs as number,
      );
      // The backend fleet itself stays idle — it never was the
      // constraint, so its own utilization does not rise with the
      // gateway's saturation.
      expect(scaled.values.backendUtilization).toBeLessThanOrEqual(
        baseline.values.backendUtilization as number,
      );
      expect(scaled.values.gatewayStatus).toBe("critical");
      expect(scaled.values.gatewaySaturationHealth).toBe("unresolved");
    });

    it("harmful/trap path: bypassing auth clears every symptom but marks the state as bypassed, not fixed", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "bypass" },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(19);
      expect(state.values.gatewayStatus).toBe("normal");
      expect(state.values.gatewaySaturationHealth).toBe("bypassed");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.gatewayStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated load exhausts the gateway's own connection pool on a second wave", () => {
      const beforeSecondWave = runScenario(TRAFFIC_GROWTH_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.gatewayConnectionCount).toBeGreaterThanOrEqual(3_000);
      expect(beforeSecondWave.values.gatewayQueueDepth).toBeGreaterThan(0);

      const afterSecondWave = runScenario(TRAFFIC_GROWTH_MS + 3 * 60_000 + 5_000);
      expect(afterSecondWave.values.gatewayConnectionCount).toBe(6_000);
      expect(afterSecondWave.values.gatewayQueueDepth).toBe(920);
      expect(afterSecondWave.values.backendUtilization).toBe(18);
    });

    it("partial path: connection reuse alone gives relief but stays degraded", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(64);
      expect(state.values.gatewayStatus).toBe("warning");
      expect(state.values.gatewaySaturationHealth).toBe("unresolved");
    });

    it("partial path: route simplification alone gives relief but stays degraded", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(58);
      expect(state.values.gatewayStatus).toBe("warning");
    });

    it("partial path: gateway capacity scaled up alone gives relief but stays degraded and raises cost", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: GATEWAY_CAPACITY_KEY, value: 8 },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(71);
      expect(state.values.gatewayStatus).toBe("warning");
    });

    it("partial path: rate limiting at the gateway sheds load but stays degraded", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: RATE_LIMIT_AT_GATEWAY_KEY, value: 2_000 },
      ]);
      expect(state.values.gatewayCpuUtilization).toBe(55);
      expect(state.values.gatewayStatus).toBe("warning");
    });

    it("stays active (never auto-fails) even after gateway CPU remains at or above 95% past the old sustained window", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 3 * 60_000 + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        apiGatewaySaturationSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak gateway CPU and peak connection count generically via numericWatchFields", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 1_000);
      expect(state.peaks.peakValues.gatewayCpuUtilization).toBe(94);
      expect(state.peaks.peakValues.gatewayConnectionCount).toBe(3_400);
    });

    it("tracks monthly infrastructure cost that increases with both gateway and backend capacity", () => {
      let state = createInitialState(apiGatewaySaturationSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = apiGatewaySaturationSimulation.tickMs;
      state = simulate(
        apiGatewaySaturationSimulation,
        state,
        { id: "scale-gateway", timestampMs: 0, controlKey: GATEWAY_CAPACITY_KEY, value: 16 },
        tickMs,
      ).state;
      state = simulate(
        apiGatewaySaturationSimulation,
        state,
        { id: "scale-backend", timestampMs: tickMs, controlKey: BACKEND_CAPACITY_KEY, value: 48 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 980 + 980);
    });
  });

  describe("Phase 6.1: candidate-declared completion, single optimal tier (no acceptable tier)", () => {
    it("fixed (connection reuse + simplified routing), sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiGatewaySaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("lightweight auth alone, sustained, is also eligible for an OPTIMAL-tier Finish (alternate good path)", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "lightweight" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiGatewaySaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("auth-bypass trap, even sustained with clean numeric metrics, is NOT eligible for any Finish tier", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "bypass" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.values.gatewayCpuUtilization).toBe(19);
      expect(state.values.gatewayStatus).toBe("normal");
      const eligibility = evaluateCompletionEligibility(apiGatewaySaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("gateway capacity scaled alone remains ineligible for any Finish tier", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: GATEWAY_CAPACITY_KEY, value: 8 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(apiGatewaySaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        apiGatewaySaturationSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ]);
      const result = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from the auth-bypass trap -> declared_unstable", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 40_000, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "bypass" },
      ]);
      const result = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails even past the old sustained window, and remains declared_unstable under candidate_declared mode", () => {
      const state = runScenario(TRAFFIC_GROWTH_MS + 3 * 60_000 + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at the very start of the incident does NOT resolve prematurely", () => {
      // Zero actions, Finish evaluated the instant the incident starts.
      const state = runScenario(TRAFFIC_GROWTH_MS + 1_000);
      expect(state.status).toBe("critical");
      const result = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("immediate zero-action Finish before the incident even starts does NOT resolve (healthy but not yet attempted)", () => {
      // t=0, before the trafficGrowing trigger at 30s — numeric metrics
      // already look healthy, but gatewaySaturationHealth is
      // "unresolved" (never "fixed"), so the string-gated success
      // condition fails regardless of elapsed time.
      const state = runScenario(1_000);
      expect(state.status).toBe("healthy");
      expect(state.values.gatewaySaturationHealth).toBe("unresolved");
      const eligibility = evaluateCompletionEligibility(apiGatewaySaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ];
      const runA = runScenario(TRAFFIC_GROWTH_MS + 20_000, actions);
      const runB = runScenario(TRAFFIC_GROWTH_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (fixed), alternate-good (lightweight auth), baseline, harmful (backend scaling), and trap (auth bypass) paths with coherent ordering", () => {
      // Window must exceed the mitigation instant plus successCondition's
      // 30s sustain window for the good/alt-good paths to ever become
      // Finish-eligible.
      const SCORING_WINDOW_MS = TRAFFIC_GROWTH_MS + 40_000;

      const goodState = runScenario(SCORING_WINDOW_MS, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: CONNECTION_REUSE_ENABLED_KEY, value: true },
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: ROUTE_COMPLEXITY_KEY, value: "simplified" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(apiGatewaySaturationSimulation, goodState);
      expect(goodFinish.outcome).toBe("resolved");
      expect(goodFinish.completionTier).toBe("optimal");
      const goodScore = scoreAuthoredAttempt(
        API_GATEWAY_SATURATION_SCORING,
        extractFinishScoringInputs(apiGatewaySaturationSimulation, goodFinish),
      );

      const altGoodState = runScenario(SCORING_WINDOW_MS, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "lightweight" },
      ]);
      const altGoodFinish = evaluateCandidateDeclaredFinish(
        apiGatewaySaturationSimulation,
        altGoodState,
      );
      expect(altGoodFinish.outcome).toBe("resolved");
      expect(altGoodFinish.completionTier).toBe("optimal");
      const altGoodScore = scoreAuthoredAttempt(
        API_GATEWAY_SATURATION_SCORING,
        extractFinishScoringInputs(apiGatewaySaturationSimulation, altGoodFinish),
      );

      // Baseline/harmful/trap paths never reach Finish eligibility —
      // score them as never-resolved attempts via the unresolved
      // terminal override (no synthetic resolvedAtMs is ever
      // fabricated).
      const baselineState = runScenario(SCORING_WINDOW_MS);
      const baselineScore = scoreAuthoredAttempt(
        API_GATEWAY_SATURATION_SCORING,
        extractScoringInputs(apiGatewaySaturationSimulation, baselineState),
      );

      const harmfulState = runScenario(SCORING_WINDOW_MS, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: BACKEND_CAPACITY_KEY, value: 24 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        API_GATEWAY_SATURATION_SCORING,
        extractScoringInputs(apiGatewaySaturationSimulation, harmfulState),
      );

      const bypassState = runScenario(SCORING_WINDOW_MS, [
        { atMs: TRAFFIC_GROWTH_MS + 1_000, controlKey: AUTH_MIDDLEWARE_MODE_KEY, value: "bypass" },
      ]);
      const bypassScore = scoreAuthoredAttempt(
        API_GATEWAY_SATURATION_SCORING,
        extractScoringInputs(apiGatewaySaturationSimulation, bypassState),
      );

      // Executed totals (verified by actually running the scorer — see
      // this scenario's completion report): good/alt-good resolve
      // OPTIMAL and score identically (865) since both are genuine,
      // structurally different routes to the same real fix; baseline
      // (550) never resolves; harmful backend-scaling (490) scores
      // below baseline on cost efficiency and operational efficiency;
      // the auth-bypass trap (375) never resolves either (its
      // successCondition fails on gatewaySaturationHealth) and is
      // additionally penalized on dataIntegrity for disabling
      // authentication, keeping it well below the real fix despite
      // numerically clean metrics.
      expect(goodScore.total).toBe(865);
      expect(altGoodScore.total).toBe(865);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBeLessThanOrEqual(baselineScore.total);
      // The bypass trap never reaches Finish eligibility either (its
      // successCondition fails on gatewaySaturationHealth), so it is
      // scored as unresolved too — and must NOT outscore the baseline
      // just because its numeric metrics look clean; dataIntegrity's
      // bypass penalty keeps it from ever approaching the real fix.
      expect(bypassScore.total).toBeLessThan(goodScore.total);
      expect(bypassScore.total).toBeLessThan(baselineScore.total);
      expect(bypassScore.total).toBe(375);
      expect(harmfulScore.total).toBe(490);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
