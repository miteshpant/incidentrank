import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { retryBudgetExhaustion } from "./retry-budget-exhaustion";
import {
  retryBudgetExhaustionSimulation,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  CIRCUIT_BREAKER_ENABLED_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
} from "./retry-budget-exhaustion/definition";
import { RETRY_BUDGET_EXHAUSTION_SCORING } from "./retry-budget-exhaustion/scoring";
import { retryBudgetExhaustionCandidateUI } from "./retry-budget-exhaustion/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = retryBudgetExhaustionSimulation;
const PRICING_DEGRADATION_BEGINS_MS = 30_000;

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(SIM);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += SIM.tickMs) {
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

    const result = simulate(SIM, state, action, SIM.tickMs);
    state = result.state;
  }

  return state;
}

describe("Retry Budget Exhaustion", () => {
  it("carries real library metadata, is linear-structured, intermediate-level, and paid", () => {
    expect(retryBudgetExhaustion.structure).toBe("linear");
    expect(retryBudgetExhaustion.difficulty).toBe("intermediate");
    expect(retryBudgetExhaustion.isFree).toBe(false);
    expect(retryBudgetExhaustion.library?.category).toBe("Microservices & Dependencies");
    expect(retryBudgetExhaustion.library?.primarySkill).toBeTruthy();
    expect(retryBudgetExhaustion.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1 and a stable id/slug", () => {
    expect(retryBudgetExhaustion.version).toBe(1);
    expect(retryBudgetExhaustion.id).toBe("retry-budget-exhaustion");
    expect(retryBudgetExhaustion.slug).toBe("retry-budget-exhaustion");
  });

  it("has exactly 2 components (single-hop, introductory amplification)", () => {
    expect(SIM.architecture.nodes.length).toBe(2);
    expect(SIM.architecture.edges.length).toBe(1);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = retryBudgetExhaustionCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with both services normal", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.recommendationLatencyMs).toBe(60);
    expect(state.values.pricingErrorRatePercent).toBe(2);
    expect(state.values.retryAmplificationRatio).toBe(1);
  });

  it("left untouched, naive retries amplify Pricing Service load into a critical state", () => {
    const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 1_000);
    expect(state.componentHealth["pricing-service"]).toBe("critical");
    expect(state.values.retryAmplificationRatio).toBeGreaterThanOrEqual(3);
    expect(state.values.pricingErrorRatePercent).toBeGreaterThan(30);
  });

  it("a noise signal (deploy pipeline queue depth) climbs during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const amplifying = runScenario(PRICING_DEGRADATION_BEGINS_MS + 1_000);
    expect(amplifying.values.deployPipelineQueueDepth as number).toBeGreaterThan(
      healthy.values.deployPipelineQueueDepth as number,
    );
    // Queue depth stays roughly unchanged by the correct fix — proving it
    // never factored into successCondition/failureCondition/rules.
    const fixed = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
      { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
      {
        atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000,
        controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
        value: true,
      },
    ]);
    expect(fixed.values.deployPipelineQueueDepth).toBe(9);
  });

  describe("inferior investigation path", () => {
    it("scaling out Pricing Service alone is plausible but insufficient — amplification outpaces added capacity", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 5_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: PRICING_SERVICE_REPLICA_COUNT_KEY,
          value: 32,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("scaled-pricing-only");
      expect(state.componentHealth["pricing-service"]).toBe("critical");
      expect(state.values.retryAmplificationRatio).toBeGreaterThanOrEqual(3);
    });

    it("bounding retries without enabling the circuit breaker only partially relieves the incident", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 5_000, [
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
      ]);
      expect(state.values.diagnosisPath).toBe("bounded-retries-no-breaker");
      expect(state.componentHealth["pricing-service"]).toBe("degraded");
      expect(state.values.retryAmplificationRatio).toBeLessThan(3);
      expect(state.values.retryAmplificationRatio).toBeGreaterThan(1);
    });
  });

  describe("the correct fix — order independence", () => {
    it("investigating retry metrics then bounding retries then enabling the circuit breaker reaches the correlated path", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: INSPECT_RETRY_METRICS_KEY,
          value: true,
        },
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["pricing-service"]).toBe("healthy");
      expect(state.componentHealth["recommendation-service"]).toBe("healthy");
    });

    it("enabling the circuit breaker first, then bounding retries, then investigating — a different order reaches the same correlated path", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
          controlKey: INSPECT_RETRY_METRICS_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("applying the fix (retries=0) without investigating still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 0 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["pricing-service"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires Pricing error rate, latency, and amplification ratio all recovered together", () => {
    const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
      { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
      {
        atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000,
        controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
        value: true,
      },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after retry amplification remains critical past the old sustained window", () => {
    const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      {
        atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
        controlKey: INSPECT_RETRY_METRICS_KEY,
        value: true,
      },
      { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
    ];
    const runA = runScenario(PRICING_DEGRADATION_BEGINS_MS + 10_000, actions);
    const runB = runScenario(PRICING_DEGRADATION_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(RETRY_BUDGET_EXHAUSTION_SCORING, inputs);
    }

    it("a candidate who investigates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: INSPECT_RETRY_METRICS_KEY,
          value: true,
        },
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);
      const guessed = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 0 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("a candidate who scales Pricing Service instead of fixing the retry policy scores lower than one who takes the correct path", () => {
      const correlated = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: INSPECT_RETRY_METRICS_KEY,
          value: true,
        },
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);
      const scaledOnly = runScenario(5 * 60_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: PRICING_SERVICE_REPLICA_COUNT_KEY,
          value: 32,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(scaledOnly).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000,
          controlKey: INSPECT_RETRY_METRICS_KEY,
          value: true,
        },
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);
      const guessed = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 0 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);

      const correlatedResult = scoreOf(correlated);
      const guessedResult = scoreOf(guessed);
      expect(correlatedResult.breakdown.dataIntegrity).toBe(200);
      expect(guessedResult.breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(PRICING_DEGRADATION_BEGINS_MS + 20_000, [
        { atMs: PRICING_DEGRADATION_BEGINS_MS + 2_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 1 },
        {
          atMs: PRICING_DEGRADATION_BEGINS_MS + 3_000,
          controlKey: CIRCUIT_BREAKER_ENABLED_KEY,
          value: true,
        },
      ]);
      const result = scoreOf(correlated);

      expect(result.maxPoints).toEqual({
        recovery: 300,
        customerImpact: 200,
        dataIntegrity: 200,
        reliability: 150,
        costEfficiency: 100,
        operationalEfficiency: 50,
      });
    });

    it("the sum of every dimension's maxPoints is exactly 1000", () => {
      const total = RETRY_BUDGET_EXHAUSTION_SCORING.dimensions.reduce(
        (sum, dimension) => sum + dimension.maxPoints,
        0,
      );
      expect(total).toBe(1000);
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces retry amplification ratio as the root cause and Pricing Service metrics as observed effects", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(retryBudgetExhaustionCandidateUI, state.values);

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Retry Amplification Ratio");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining([
          "Pricing Service Error Rate",
          "Pricing Service p95 Latency",
          "Recommendation Service Latency",
          "Recommendation Service Error Rate",
        ]),
      );
    });

    it("never surfaces the noise-tagged deploy pipeline queue depth in any narrative group", () => {
      const state = runScenario(PRICING_DEGRADATION_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(retryBudgetExhaustionCandidateUI, state.values);
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Deploy Pipeline Queue Depth")).toBe(false);
    });
  });
});
