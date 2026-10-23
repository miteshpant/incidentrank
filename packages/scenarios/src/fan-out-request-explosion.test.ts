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
import { fanOutRequestExplosion } from "./fan-out-request-explosion";
import {
  ENRICHMENT_CALL_ENABLED_KEY,
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  fanOutRequestExplosionSimulation,
  PARTIAL_RESPONSE_POLICY_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
} from "./fan-out-request-explosion/definition";
import { fanOutRequestExplosionCandidateUI } from "./fan-out-request-explosion/candidate-ui";
import { FAN_OUT_REQUEST_EXPLOSION_SCORING } from "./fan-out-request-explosion/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(fanOutRequestExplosionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += fanOutRequestExplosionSimulation.tickMs
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
      fanOutRequestExplosionSimulation,
      state,
      action,
      fanOutRequestExplosionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const FAN_OUT_WIDENED_MS = 30_000;
const SERVICE_E_DEGRADING_MS = FAN_OUT_WIDENED_MS + 45_000;

describe("Fan-Out Request Explosion", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(fanOutRequestExplosion.isFree).toBe(false);
      expect(fanOutRequestExplosion.library?.category).toBe("Microservices & Dependencies");
      expect(fanOutRequestExplosion.library?.tags.length).toBeGreaterThan(0);
      expect(fanOutRequestExplosion.library?.skills.length).toBeGreaterThan(0);
      expect(fanOutRequestExplosion.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = FAN_OUT_REQUEST_EXPLOSION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = FAN_OUT_REQUEST_EXPLOSION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(fanOutRequestExplosionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(fanOutRequestExplosionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(fanOutRequestExplosionCandidateUI.components.length).toBe(7);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(fanOutRequestExplosionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.customerSuccessRatePercent).toBe(99.5);
      expect(state.values.corePathHealth).toBe("core-path-intact");
    });

    it("fan-out widens before Service E degrades, giving an observable early warning", () => {
      const state = runScenario(FAN_OUT_WIDENED_MS + 1_000);
      expect(state.values.downstreamQpsServiceE).toBe(180);
      expect(state.values.serviceESaturationPercent).toBe(55);
      expect(state.values.aggregatorStatus).toBe("warning");
      // Not yet a scored incident start — the real incident begins once
      // Service E actually degrades.
    });

    it("Service E degrading triggers the baseline critical incident", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 1_000);
      // incidentStartedAtMs marks the first timed event that sets any
      // trigger true — the earlier fan-out-widened warning, per the
      // engine's own convention (tick.ts) — not the later Service E
      // degradation that actually tips the incident into "critical".
      expect(state.incidentStartedAtMs).toBe(FAN_OUT_WIDENED_MS);
      expect(state.status).toBe("critical");
      expect(state.values.customerSuccessRatePercent).toBe(44);
      expect(state.values.aggregatorStatus).toBe("critical");
    });

    it("strong path: excluding the optional enrichment call resolves the incident regardless of other controls", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: ENRICHMENT_CALL_ENABLED_KEY, value: false },
      ]);
      expect(state.values.customerSuccessRatePercent).toBe(99.6);
      expect(state.values.corePathHealth).toBe("core-path-intact");
      expect(state.values.aggregatorStatus).toBe("normal");
    });

    it("alternate strong path: partial responses plus a short Service E timeout reach the same safe bar without excluding the call", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: PARTIAL_RESPONSE_POLICY_KEY, value: "partialAllowed" },
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: SERVICE_E_TIMEOUT_MS_KEY, value: 300 },
      ]);
      expect(state.values.customerSuccessRatePercent).toBe(99.4);
      expect(state.values.corePathHealth).toBe("core-path-intact");
      expect(state.values.aggregatorStatus).toBe("normal");
    });

    it("pressure-transfer: batching alone relieves Service E but visibly pushes Service A toward saturation", () => {
      const baseline = runScenario(SERVICE_E_DEGRADING_MS + 20_000);
      const batched = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
      ]);

      // Primary symptom relieved relative to baseline.
      expect(batched.values.serviceESaturationPercent).toBeLessThan(
        baseline.values.serviceESaturationPercent as number,
      );
      expect(batched.values.customerSuccessRatePercent).toBeGreaterThan(
        baseline.values.customerSuccessRatePercent as number,
      );

      // Secondary subsystem (Service A, a CORE dependency) visibly
      // constrained as a direct consequence of the same mitigation.
      expect(batched.values.serviceASaturationPercent).toBeGreaterThan(
        baseline.values.serviceASaturationPercent as number,
      );
      expect(batched.values.corePathHealth).toBe("core-path-at-risk");
      expect(batched.componentHealth["service-a"]).toBe("degraded");

      // Not yet safe to hand back — this is a real but incomplete
      // mitigation, not an acceptable tier.
      expect(evaluateCompletionEligibility(fanOutRequestExplosionSimulation, batched)).toEqual({
        eligible: false,
      });
    });

    it("second-decision recovery: adding the response cache on top of batching relieves the Service A pressure batching alone introduced", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: RESPONSE_CACHE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.corePathHealth).toBe("core-path-intact");
      expect(state.values.customerSuccessRatePercent).toBe(99.3);
      expect(state.values.serviceASaturationPercent).toBeLessThan(30);
    });

    it("harmful path: raising fan-out concurrency alone worsens both Service E and Service A relative to baseline", () => {
      const baseline = runScenario(SERVICE_E_DEGRADING_MS + 20_000);
      const scaled = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY, value: 200 },
      ]);

      expect(scaled.values.serviceESaturationPercent).toBeGreaterThan(
        baseline.values.serviceESaturationPercent as number,
      );
      expect(scaled.values.serviceASaturationPercent).toBeGreaterThan(
        baseline.values.serviceASaturationPercent as number,
      );
      expect(scaled.values.customerSuccessRatePercent).toBeLessThan(
        baseline.values.customerSuccessRatePercent as number,
      );
      expect(scaled.values.corePathHealth).toBe("core-path-at-risk");
    });

    it("harmful compound trap: batching plus high concurrency breaks the core Service A dependency outright", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY, value: 200 },
      ]);
      expect(state.values.serviceASaturationPercent).toBe(97);
      expect(state.componentHealth["service-a"]).toBe("critical");
      expect(state.values.corePathHealth).toBe("core-path-at-risk");
      expect(state.values.aggregatorStatus).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000);
      expect(state.status).toBe("critical");
      expect(state.values.aggregatorStatus).toBe("critical");
    });

    it("fails if customer success stays at or below 45% for the full sustained window", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak Service E and Service A saturation generically via numericWatchFields", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 1_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY, value: 200 },
      ]);
      expect(state.peaks.peakValues.serviceESaturationPercent).toBeGreaterThanOrEqual(96);
    });

    it("tracks monthly infrastructure cost that increases with concurrency and the response cache", () => {
      let state = createInitialState(fanOutRequestExplosionSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(520);

      const tickMs = fanOutRequestExplosionSimulation.tickMs;
      state = simulate(
        fanOutRequestExplosionSimulation,
        state,
        { id: "raise-concurrency", timestampMs: 0, controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY, value: 200 },
        tickMs,
      ).state;
      state = simulate(
        fanOutRequestExplosionSimulation,
        state,
        { id: "enable-cache", timestampMs: tickMs, controlKey: RESPONSE_CACHE_ENABLED_KEY, value: true },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(520 + 460 + 90);
    });
  });

  describe("Candidate-declared completion", () => {
    it("excluding enrichment is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: ENRICHMENT_CALL_ENABLED_KEY, value: false },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(fanOutRequestExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the partial-response alternate path is also eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: PARTIAL_RESPONSE_POLICY_KEY, value: "partialAllowed" },
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: SERVICE_E_TIMEOUT_MS_KEY, value: 300 },
      ]);
      const eligibility = evaluateCompletionEligibility(fanOutRequestExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("batching alone (Service A at risk) is NOT eligible for any Finish tier", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
      ]);
      const eligibility = evaluateCompletionEligibility(fanOutRequestExplosionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("has no acceptableCondition — there is no genuine safe-but-imperfect tier for this scenario", () => {
      expect(fanOutRequestExplosionSimulation.completion?.acceptableCondition).toBeUndefined();
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: ENRICHMENT_CALL_ENABLED_KEY, value: false },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        fanOutRequestExplosionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: ENRICHMENT_CALL_ENABLED_KEY, value: false },
      ]);
      const result = evaluateCandidateDeclaredFinish(fanOutRequestExplosionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(fanOutRequestExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the batching-alone pressure-transfer state -> declared_unstable, not acceptable", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(fanOutRequestExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(SERVICE_E_DEGRADING_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(fanOutRequestExplosionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
        { atMs: SERVICE_E_DEGRADING_MS + 5_000, controlKey: RESPONSE_CACHE_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(SERVICE_E_DEGRADING_MS + 20_000, actions);
      const runB = runScenario(SERVICE_E_DEGRADING_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical events for the same action sequence run twice", () => {
      let stateA = createInitialState(fanOutRequestExplosionSimulation);
      let stateB = createInitialState(fanOutRequestExplosionSimulation);
      const eventsA: string[] = [];
      const eventsB: string[] = [];
      const tickMs = fanOutRequestExplosionSimulation.tickMs;
      const action: CandidateAction = {
        id: "exclude-enrichment",
        timestampMs: SERVICE_E_DEGRADING_MS + 1_000,
        controlKey: ENRICHMENT_CALL_ENABLED_KEY,
        value: false,
      };

      for (let t = 0; t < SERVICE_E_DEGRADING_MS + 5_000; t += tickMs) {
        const act = t === action.timestampMs ? action : null;
        const resultA = simulate(fanOutRequestExplosionSimulation, stateA, act, tickMs);
        const resultB = simulate(fanOutRequestExplosionSimulation, stateB, act, tickMs);
        stateA = resultA.state;
        stateB = resultB.state;
        eventsA.push(...resultA.events.map((e) => e.type));
        eventsB.push(...resultB.events.map((e) => e.type));
      }

      expect(eventsA).toEqual(eventsB);
      expect(stateA).toEqual(stateB);
    });
  });

  describe("Scoring", () => {
    it("scores good (enrichment excluded), alternate good (partial response), batching-at-risk (ineligible), baseline, and harmful paths with coherent ordering", () => {
      const goodState = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: ENRICHMENT_CALL_ENABLED_KEY, value: false },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(fanOutRequestExplosionSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        FAN_OUT_REQUEST_EXPLOSION_SCORING,
        extractFinishScoringInputs(fanOutRequestExplosionSimulation, goodFinish),
      );

      const altGoodState = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: PARTIAL_RESPONSE_POLICY_KEY, value: "partialAllowed" },
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: SERVICE_E_TIMEOUT_MS_KEY, value: 300 },
      ]);
      const altGoodFinish = evaluateCandidateDeclaredFinish(fanOutRequestExplosionSimulation, altGoodState);
      const altGoodScore = scoreAuthoredAttempt(
        FAN_OUT_REQUEST_EXPLOSION_SCORING,
        extractFinishScoringInputs(fanOutRequestExplosionSimulation, altGoodFinish),
      );

      // Batching alone never reaches Finish eligibility — score it as a
      // never-resolved attempt via the unresolved terminal override (no
      // synthetic resolvedAtMs is ever fabricated for an ineligible
      // state).
      const batchingAtRiskState = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
      ]);
      const batchingAtRiskScore = scoreAuthoredAttempt(
        FAN_OUT_REQUEST_EXPLOSION_SCORING,
        extractScoringInputs(fanOutRequestExplosionSimulation, batchingAtRiskState),
      );

      const baselineState = runScenario(SERVICE_E_DEGRADING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        FAN_OUT_REQUEST_EXPLOSION_SCORING,
        extractScoringInputs(fanOutRequestExplosionSimulation, baselineState),
      );

      const harmfulState = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY, value: 200 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        FAN_OUT_REQUEST_EXPLOSION_SCORING,
        extractScoringInputs(fanOutRequestExplosionSimulation, harmfulState),
      );

      const compoundTrapState = runScenario(SERVICE_E_DEGRADING_MS + 20_000, [
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: REQUEST_BATCHING_ENABLED_KEY, value: true },
        { atMs: SERVICE_E_DEGRADING_MS + 1_000, controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY, value: 200 },
      ]);
      const compoundTrapScore = scoreAuthoredAttempt(
        FAN_OUT_REQUEST_EXPLOSION_SCORING,
        extractScoringInputs(fanOutRequestExplosionSimulation, compoundTrapState),
      );

      // NOTE (section 16/17 suspicious-tie investigation): goodScore and
      // altGoodScore tie exactly at a perfect 1000 — both mitigations
      // are applied one tick after the incident's recorded start
      // (incidentStartedAtMs is the earlier fan-out-widened warning, per
      // tick.ts's convention), both land well inside the 60-second full-
      // credit recovery band, and both reach identical revenue loss,
      // criticalTimeRatio, cost, and corePathHealth outcomes — a
      // legitimate tie between two genuinely different, equally fast,
      // equally safe strategies, not a scoring defect.
      expect(goodScore.total).toBe(1000);
      expect(altGoodScore.total).toBe(1000);
      expect(baselineScore.total).toBe(550);
      expect(batchingAtRiskScore.total).toBe(410);
      expect(harmfulScore.total).toBe(350);
      expect(compoundTrapScore.total).toBe(350);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(batchingAtRiskScore.total);
      expect(batchingAtRiskScore.total).toBeGreaterThan(harmfulScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
