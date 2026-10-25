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
import { botTrafficSurge } from "./bot-traffic-surge";
import {
  botTrafficSurgeSimulation,
  CACHE_AGGRESSIVENESS_KEY,
  CHALLENGE_POLICY_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  RATE_LIMIT_TIER_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
} from "./bot-traffic-surge/definition";
import { botTrafficSurgeCandidateUI } from "./bot-traffic-surge/candidate-ui";
import { BOT_TRAFFIC_SURGE_SCORING } from "./bot-traffic-surge/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(botTrafficSurgeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += botTrafficSurgeSimulation.tickMs) {
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

    const result = simulate(botTrafficSurgeSimulation, state, action, botTrafficSurgeSimulation.tickMs);
    state = result.state;
  }

  return state;
}

const BOT_SURGE_RISING_MS = 30_000;
const ESCALATING_MS = BOT_SURGE_RISING_MS + 3 * 60_000;

describe("Bot Traffic Surge", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(botTrafficSurge.isFree).toBe(false);
      expect(botTrafficSurge.library?.category).toBe("API & Traffic");
      expect(botTrafficSurge.library?.tags.length).toBeGreaterThan(0);
      expect(botTrafficSurge.library?.skills.length).toBeGreaterThan(0);
      expect(botTrafficSurge.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = BOT_TRAFFIC_SURGE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = BOT_TRAFFIC_SURGE_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(botTrafficSurgeCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(botTrafficSurgeCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(botTrafficSurgeCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(botTrafficSurgeCandidateUI.components.length).toBe(4);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(botTrafficSurgeSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.backendLoadPct).toBe(22);
      expect(state.values.defenseMode).toBe("unresolved");
    });

    it("bot surge rising triggers the baseline incident", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(BOT_SURGE_RISING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.backendLoadPct).toBe(78);
      expect(state.values.suspiciousTrafficRatioPct).toBe(46);
      expect(state.values.falsePositiveRatePct).toBe(0);
    });

    it("strong path: targeted defense stack recovers backend load with a near-zero false-positive cost", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
        { atMs: BOT_SURGE_RISING_MS + 3_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      expect(state.values.backendLoadPct).toBe(24);
      expect(state.values.falsePositiveRatePct).toBeLessThanOrEqual(1);
      expect(state.values.defenseMode).toBe("targeted");
      expect(state.values.trafficStatus).toBe("normal");
    });

    it("harmful path: stacking aggressive challenge + strict rate limit cuts load but spikes false positives", () => {
      const baseline = runScenario(BOT_SURGE_RISING_MS + 20_000);
      const coarse = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ]);

      // Backend-facing metric looks great...
      expect(coarse.values.backendLoadPct).toBeLessThan(baseline.values.backendLoadPct as number);
      // ...but real customers are measurably harmed.
      expect(coarse.values.falsePositiveRatePct).toBeGreaterThan(10);
      expect(coarse.values.customerSuccessRatePct).toBeLessThan(90);
      expect(coarse.values.defenseMode).toBe("coarse-blocked");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.trafficStatus).toBe("critical");
    });

    it("alternate acceptable-leaning tradeoff: aggressive challenge alone still carries a real, non-trivial false-positive cost", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.values.falsePositiveRatePct).toBeGreaterThan(1);
      expect(state.values.defenseMode).toBe("coarse-blocked");
    });

    it("partial path: elevated cache alone gives relief but leaves backend load above the success bar", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CACHE_AGGRESSIVENESS_KEY, value: "elevated" },
      ]);
      expect(state.values.backendLoadPct).toBeGreaterThan(35);
      expect(state.values.defenseMode).toBe("unresolved");
    });

    it("partial path: tenant quota enforcement alone is identity-scoped, near-zero false positives, but incomplete", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      expect(state.values.falsePositiveRatePct).toBeLessThan(1);
      expect(state.values.backendLoadPct).toBeGreaterThan(35);
      expect(state.values.defenseMode).toBe("unresolved");
    });

    it("trap: targeted endpoint scope without traffic sampling behaves like an unsigned guess", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
      ]);
      expect(state.values.defenseMode).toBe("unresolved");
      expect(state.values.falsePositiveRatePct).toBeGreaterThan(0);
      expect(state.values.backendLoadPct).toBeGreaterThan(35);
    });

    it("delayed consequence: sustained unmitigated surge escalates on a second wave, with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(BOT_SURGE_RISING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.backendLoadPct).toBeGreaterThan(50);
      expect(beforeSecondWave.values.suspiciousTrafficRatioPct).toBeGreaterThan(20);

      const afterSecondWave = runScenario(ESCALATING_MS + 5_000);
      expect(afterSecondWave.values.trafficStatus).toBe("critical");
      expect(afterSecondWave.values.backendLoadPct).toBe(96);
    });

    it("fails if backend load stays at or above 95% for the full sustained window", () => {
      const state = runScenario(ESCALATING_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak backend load and peak false-positive rate generically via numericWatchFields", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ]);
      expect(state.peaks.peakValues.backendLoadPct).toBeGreaterThan(0);
      expect(state.peaks.peakValues.falsePositiveRatePct).toBe(14.5);
    });

    it("tracks monthly infrastructure cost that increases with challenge policy and traffic sampling", () => {
      let state = createInitialState(botTrafficSurgeSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = botTrafficSurgeSimulation.tickMs;
      state = simulate(
        botTrafficSurgeSimulation,
        state,
        { id: "enable-sampling", timestampMs: 0, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 140);
    });
  });

  describe("Phase 6.1: candidate-declared completion — exactly one safe terminal state", () => {
    it("targeted defense, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
        { atMs: BOT_SURGE_RISING_MS + 3_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(botTrafficSurgeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("coarse-blocked high-collateral state remains ineligible for any Finish tier despite healthy backend load", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(botTrafficSurgeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("aggressive-challenge-alone bounded tradeoff also remains ineligible — 6.5% false positives is not a safe handback", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(botTrafficSurgeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
        { atMs: BOT_SURGE_RISING_MS + 3_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        botTrafficSurgeSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
        { atMs: BOT_SURGE_RISING_MS + 3_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe coarse-blocked state -> declared_unstable even though backend load looks healthy", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ]);
      const result = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(ESCALATING_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at incident start does not resolve prematurely", () => {
      const state = runScenario(BOT_SURGE_RISING_MS + 1_000);
      const result = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.values.defenseMode).toBe("unresolved");
    });

    it("immediate zero-action Finish before the incident even starts does not resolve prematurely", () => {
      const state = runScenario(1_000);
      const result = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
        { atMs: BOT_SURGE_RISING_MS + 3_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ];
      const runA = runScenario(BOT_SURGE_RISING_MS + 40_000, actions);
      const runB = runScenario(BOT_SURGE_RISING_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state, events, and score for a harmful action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ];
      const runA = runScenario(BOT_SURGE_RISING_MS + 40_000, actions);
      const runB = runScenario(BOT_SURGE_RISING_MS + 40_000, actions);
      expect(runA).toEqual(runB);

      const scoreA = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, runA),
      );
      const scoreB = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, runB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores good (targeted), baseline, harmful (coarse-blocked), and immediate-finish paths with coherent ordering", () => {
      const goodState = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TRAFFIC_SAMPLING_ENABLED_KEY, value: true },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: ENDPOINT_PROTECTION_SCOPE_KEY, value: "targeted" },
        { atMs: BOT_SURGE_RISING_MS + 3_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(botTrafficSurgeSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractFinishScoringInputs(botTrafficSurgeSimulation, goodFinish),
      );

      // Baseline/harmful/immediate-finish paths never reach Finish
      // eligibility — score them as never-resolved attempts via the
      // unresolved terminal override (no synthetic resolvedAtMs is ever
      // fabricated).
      const baselineState = runScenario(BOT_SURGE_RISING_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, baselineState),
      );

      const harmfulState = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, harmfulState),
      );

      const immediateFinishState = runScenario(BOT_SURGE_RISING_MS + 1_000);
      const immediateFinishScore = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, immediateFinishState),
      );

      // Executed totals, read directly from the real scorer run above.
      // Note: goodScore's reliability band lands at the lowest tier (15
      // points) because extractFinishScoringInputs derives
      // criticalTimeRatio from the full incident-start-to-sustained-
      // Finish window, which here includes the ~30s of
      // successCondition.sustainedSeconds itself spent in "critical"
      // status before the targeted stack's own sustain window completes
      // — a pre-existing, already-accepted engine-wide limitation (see
      // Missing Database Index's scoring.ts doc comment and
      // docs/implementation_plan/phase6b.md section 18's "Terminal-
      // Override Limitation"), not something this scenario's scoring can
      // or should special-case.
      expect(goodScore.total).toBe(845);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(385);
      expect(immediateFinishScore.total).toBe(550);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
      expect(immediateFinishScore.total).toBe(baselineScore.total);
    });

    it("scores the coarse-blocked high-collateral state as unresolved and worse than the strict-limit-alone collateral path is not assumed, only measured", () => {
      const coarseBlockedState = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: CHALLENGE_POLICY_KEY, value: "aggressive" },
        { atMs: BOT_SURGE_RISING_MS + 2_000, controlKey: RATE_LIMIT_TIER_KEY, value: "strict" },
      ]);
      const coarseBlockedScore = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, coarseBlockedState),
      );

      const tenantQuotaOnlyState = runScenario(BOT_SURGE_RISING_MS + 40_000, [
        { atMs: BOT_SURGE_RISING_MS + 1_000, controlKey: TENANT_QUOTA_ENFORCEMENT_KEY, value: true },
      ]);
      const tenantQuotaOnlyScore = scoreAuthoredAttempt(
        BOT_TRAFFIC_SURGE_SCORING,
        extractScoringInputs(botTrafficSurgeSimulation, tenantQuotaOnlyState),
      );

      // Both are unresolved (neither reaches Finish eligibility), but the
      // coarse-blocked path's dataIntegrity penalty for a real customer
      // harm still applies, and its harmful-change penalty on
      // operationalEfficiency applies too — both are real, authored
      // consequences of having applied the aggressive+strict combination,
      // not an artifact.
      expect(coarseBlockedScore.breakdown.dataIntegrity).toBeLessThan(
        tenantQuotaOnlyScore.breakdown.dataIntegrity,
      );
      expect(coarseBlockedScore.total).toBeLessThan(tenantQuotaOnlyScore.total);
    });
  });
});
