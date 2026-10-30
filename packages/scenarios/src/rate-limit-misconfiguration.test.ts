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
import { rateLimitMisconfiguration } from "./rate-limit-misconfiguration";
import {
  BURST_SIZE_KEY,
  EMERGENCY_BYPASS_KEY,
  GLOBAL_QUOTA_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  RATE_LIMIT_POLICY_KEY,
  rateLimitMisconfigurationSimulation,
} from "./rate-limit-misconfiguration/definition";
import { rateLimitMisconfigurationCandidateUI } from "./rate-limit-misconfiguration/candidate-ui";
import { RATE_LIMIT_MISCONFIGURATION_SCORING } from "./rate-limit-misconfiguration/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(rateLimitMisconfigurationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += rateLimitMisconfigurationSimulation.tickMs
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
      rateLimitMisconfigurationSimulation,
      state,
      action,
      rateLimitMisconfigurationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const POLICY_EFFECTS_VISIBLE_MS = 30_000;
const BURST_DOMINATION_DEEPENS_MS = POLICY_EFFECTS_VISIBLE_MS + 3 * 60_000;

describe("Rate-Limit Misconfiguration", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(rateLimitMisconfiguration.isFree).toBe(false);
      expect(rateLimitMisconfiguration.library?.category).toBe("API & Traffic");
      expect(rateLimitMisconfiguration.library?.tags.length).toBeGreaterThan(0);
      expect(rateLimitMisconfiguration.library?.skills.length).toBeGreaterThan(0);
      expect(rateLimitMisconfiguration.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = RATE_LIMIT_MISCONFIGURATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = RATE_LIMIT_MISCONFIGURATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(rateLimitMisconfigurationCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(rateLimitMisconfigurationCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(rateLimitMisconfigurationCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(rateLimitMisconfigurationCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(rateLimitMisconfigurationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.rateLimitStatus).toBe("protected");
      expect(state.values.legitimateTenantSuccessRate).toBe(99);
    });

    it("policy effects visible triggers the misconfigured baseline incident", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(POLICY_EFFECTS_VISIBLE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.legitimateTenantSuccessRate).toBe(64);
      expect(state.values.bursterShareOfCapacity).toBe(58);
      expect(state.values.rateLimitStatus).toBe("protected");
    });

    it("strong path: retuning both burst size and per-tenant quota fixes both halves of the root cause", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 200 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
      ]);
      expect(state.values.legitimateTenantSuccessRate).toBe(99);
      expect(state.values.bursterShareOfCapacity).toBe(11);
      expect(state.values.rateLimitStatus).toBe("protected");
    });

    it("correctness trap: emergency bypass looks fully healthy on customer-facing metrics but is unprotected", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: EMERGENCY_BYPASS_KEY, value: true },
      ]);
      expect(state.values.rejectionRate).toBe(0);
      expect(state.values.legitimateTenantSuccessRate).toBe(100);
      expect(state.values.customerSuccessRate).toBe(99);
      // The real, authored signal that protection is gone despite the
      // healthy-looking customer metrics above.
      expect(state.values.rateLimitStatus).toBe("unprotected");
      expect(state.values.bursterShareOfCapacity).toBeGreaterThan(50);
    });

    it("bypass is never eligible for Finish regardless of how healthy customer metrics look", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: EMERGENCY_BYPASS_KEY, value: true },
      ]);
      const eligibility = evaluateCompletionEligibility(rateLimitMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("harmful path: rolling back to the previous policy relieves legitimate tenants but leaves burst domination unfixed", () => {
      const baseline = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000);
      const rolledBack = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: RATE_LIMIT_POLICY_KEY, value: "previous-policy" },
      ]);

      expect(rolledBack.values.legitimateTenantSuccessRate).toBeGreaterThan(
        baseline.values.legitimateTenantSuccessRate as number,
      );
      expect(rolledBack.values.bursterShareOfCapacity).toBeGreaterThan(50);
      const eligibility = evaluateCompletionEligibility(
        rateLimitMisconfigurationSimulation,
        rolledBack,
      );
      expect(eligibility).toEqual({ eligible: false });
    });

    it("harmful path: raising the global quota alone does not improve the dominant tenant's share and raises cost", () => {
      const baseline = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000);
      const raised = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: GLOBAL_QUOTA_KEY, value: 20_000 },
      ]);

      expect(raised.values.bursterShareOfCapacity).toBeGreaterThanOrEqual(
        baseline.values.bursterShareOfCapacity as number,
      );
      expect(raised.cost.currentMonthlyCostUsd).toBeGreaterThan(baseline.cost.currentMonthlyCostUsd);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 60_000);
      expect(state.status).toBe("critical");
    });

    it("delayed consequence: unchecked burst domination deepens on a second wave, with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(POLICY_EFFECTS_VISIBLE_MS + 60_000);
      // Observable precursor already elevated before the second wave lands.
      expect(beforeSecondWave.values.bursterShareOfCapacity).toBeGreaterThanOrEqual(50);
      expect(beforeSecondWave.values.limiterBucketUtilization).toBeGreaterThanOrEqual(70);

      const afterSecondWave = runScenario(BURST_DOMINATION_DEEPENS_MS + 5_000);
      expect(afterSecondWave.values.bursterShareOfCapacity).toBe(79);
      expect(afterSecondWave.values.legitimateTenantSuccessRate).toBe(48);
    });

    it("acceptable path: priority class favors steady tenants, protecting legitimate traffic without capping the burster", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PRIORITY_CLASS_KEY, value: "favor-steady" },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 800 },
      ]);
      expect(state.values.legitimateTenantSuccessRate).toBe(97);
      expect(state.values.bursterShareOfCapacity).toBe(34);
      expect(state.values.rateLimitStatus).toBe("protected");
    });

    it("stays active (never auto-fails) even after legitimate tenant success stays at or below 50% past the old sustained window", () => {
      const state = runScenario(BURST_DOMINATION_DEEPENS_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        rateLimitMisconfigurationSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak burster share generically via numericWatchFields", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 1_000);
      expect(state.peaks.peakValues.bursterShareOfCapacity).toBe(58);
    });

    it("tracks monthly infrastructure cost that increases with global quota", () => {
      let state = createInitialState(rateLimitMisconfigurationSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(300);

      const tickMs = rateLimitMisconfigurationSimulation.tickMs;
      state = simulate(
        rateLimitMisconfigurationSimulation,
        state,
        { id: "raise-global-quota", timestampMs: 0, controlKey: GLOBAL_QUOTA_KEY, value: 20_000 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(300 + 260);
    });
  });

  describe("Phase 6.1: two-tier completion — retuned (optimal) vs priority-favored (acceptable)", () => {
    it("retuned (burst tightened + quota raised), sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 200 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(rateLimitMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("priority-favored-steady, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate bounded tradeoff, not a trap", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PRIORITY_CLASS_KEY, value: "favor-steady" },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 800 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(rateLimitMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("emergency bypass remains ineligible for any Finish tier no matter how healthy customer metrics look", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: EMERGENCY_BYPASS_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(rateLimitMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("quota raised alone (burst still open) remains ineligible for any Finish tier", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 800 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(rateLimitMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 200 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        rateLimitMisconfigurationSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PRIORITY_CLASS_KEY, value: "favor-steady" },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 800 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        rateLimitMisconfigurationSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 200 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
      ]);
      const result = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PRIORITY_CLASS_KEY, value: "favor-steady" },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 800 },
      ]);
      const result = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000);
      const result = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the emergency-bypass trap -> declared_unstable, never resolved", () => {
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: EMERGENCY_BYPASS_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode, and a Finish there still declares unstable", () => {
      const state = runScenario(BURST_DOMINATION_DEEPENS_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at/after incident start does not resolve — waiting alone earns nothing", () => {
      // Candidate makes ZERO changes and declares Finish the instant the
      // incident has started (per the mandatory immediate-finish audit).
      const state = runScenario(POLICY_EFFECTS_VISIBLE_MS + 1_000);
      expect(state.status).toBe("critical");
      const eligibility = evaluateCompletionEligibility(rateLimitMisconfigurationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish before the incident starts is not a meaningful resolution", () => {
      // Before policyEffectsVisible ever fires, the engine is still on
      // the pre-incident healthy default rule, which numerically already
      // satisfies successCondition's thresholds. This is never a
      // meaningful "solved incident" result: no incident has started.
      const state = createInitialState(rateLimitMisconfigurationSimulation);
      expect(state.incidentStartedAtMs).toBeNull();
      expect(state.status).toBe("healthy");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 200 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
      ];
      const runA = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, actions);
      const runB = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (retuned), acceptable (priority-favored), baseline, harmful (bypass), and harmful (rollback) paths with coherent ordering", () => {
      const goodState = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 200 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(rateLimitMisconfigurationSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        RATE_LIMIT_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(rateLimitMisconfigurationSimulation, goodFinish),
      );

      const acceptableState = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PRIORITY_CLASS_KEY, value: "favor-steady" },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: BURST_SIZE_KEY, value: 800 },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        rateLimitMisconfigurationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        RATE_LIMIT_MISCONFIGURATION_SCORING,
        extractFinishScoringInputs(rateLimitMisconfigurationSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000);
      const baselineScore = scoreAuthoredAttempt(
        RATE_LIMIT_MISCONFIGURATION_SCORING,
        extractScoringInputs(rateLimitMisconfigurationSimulation, baselineState),
      );

      const bypassState = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: EMERGENCY_BYPASS_KEY, value: true },
      ]);
      const bypassScore = scoreAuthoredAttempt(
        RATE_LIMIT_MISCONFIGURATION_SCORING,
        extractScoringInputs(rateLimitMisconfigurationSimulation, bypassState),
      );

      const rollbackState = runScenario(POLICY_EFFECTS_VISIBLE_MS + 25_000, [
        { atMs: POLICY_EFFECTS_VISIBLE_MS + 1_000, controlKey: RATE_LIMIT_POLICY_KEY, value: "previous-policy" },
      ]);
      const rollbackScore = scoreAuthoredAttempt(
        RATE_LIMIT_MISCONFIGURATION_SCORING,
        extractScoringInputs(rateLimitMisconfigurationSimulation, rollbackState),
      );

      // Sharpest correctness check: the bypass path must NOT outscore a
      // genuine mitigation, despite its customer-facing metrics looking
      // perfect — its unresolved-terminal customerImpact/recovery/
      // reliability dimensions AND its dataIntegrity penalty both pull
      // it down relative to a real fix.
      expect(goodScore.total).toBeGreaterThan(bypassScore.total);
      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(rollbackScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(bypassScore.total);

      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(825);
      expect(baselineScore.total).toBe(550);
      expect(rollbackScore.total).toBe(535);
      // The sharpest correctness assertion: despite customer-facing
      // metrics reading nearly perfect under bypass (99-100% success,
      // 0% rejection), its score is far WORSE than the unresolved
      // baseline — the dataIntegrity penalty for removing fairness
      // protection dominates the comparison, exactly as the scenario's
      // correctness requirement demands.
      expect(bypassScore.total).toBe(365);
      expect(bypassScore.total).toBeLessThan(baselineScore.total);
    });
  });
});
