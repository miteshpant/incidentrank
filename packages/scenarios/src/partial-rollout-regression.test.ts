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
import { partialRolloutRegression } from "./partial-rollout-regression";
import {
  DEPENDENCY_PROTECTION_MODE_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  partialRolloutRegressionSimulation,
  REGRESSED_FEATURE_ENABLED_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  ROLLOUT_PERCENT_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
} from "./partial-rollout-regression/definition";
import { partialRolloutRegressionCandidateUI } from "./partial-rollout-regression/candidate-ui";
import { PARTIAL_ROLLOUT_REGRESSION_SCORING } from "./partial-rollout-regression/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(partialRolloutRegressionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += partialRolloutRegressionSimulation.tickMs
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
      partialRolloutRegressionSimulation,
      state,
      action,
      partialRolloutRegressionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const REGRESSION_ACTIVE_MS = 30_000;
const DEPENDENCY_SATURATION_MS = REGRESSION_ACTIVE_MS + 3 * 60_000;

describe("Deployment Regression (partial-rollout-regression)", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(partialRolloutRegression.isFree).toBe(false);
      expect(partialRolloutRegression.library?.category).toBe("Deployments & Reliability");
      expect(partialRolloutRegression.library?.tags.length).toBeGreaterThan(0);
      expect(partialRolloutRegression.library?.skills.length).toBeGreaterThan(0);
      expect(partialRolloutRegression.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = PARTIAL_ROLLOUT_REGRESSION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = PARTIAL_ROLLOUT_REGRESSION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (>=4), and components", () => {
      expect(partialRolloutRegressionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(partialRolloutRegressionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(partialRolloutRegressionCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(partialRolloutRegressionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.newVersionErrorRate).toBe(0.3);
      expect(state.values.regressionHealth).toBe("unresolved");
    });

    it("the regression trigger fires the baseline critical incident, affecting only the new version", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REGRESSION_ACTIVE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.newVersionErrorRate).toBe(8.4);
      expect(state.values.oldVersionErrorRate).toBe(0.3);
      expect(state.values.rolloutState).toBe("critical");
    });

    it("good path A: full rollback recovers both versions and marks the regression removed", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLBACK_TO_OLD_VERSION_KEY, value: true },
      ]);
      expect(state.values.newVersionErrorRate).toBe(0.2);
      expect(state.values.customerSuccessRate).toBe(99.7);
      expect(state.values.regressionHealth).toBe("regression-removed");
    });

    it("good path B (alternate): disabling the regressed feature recovers just as fully, preserving the rollout", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: REGRESSED_FEATURE_ENABLED_KEY, value: false },
      ]);
      expect(state.values.newVersionErrorRate).toBeLessThanOrEqual(1);
      expect(state.values.customerSuccessRate).toBe(99.7);
      expect(state.values.regressionHealth).toBe("regression-removed");
    });

    it("good path C (alternate): zeroing rollout percentage reaches the same no-exposure recovery without a rollback flag", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLOUT_PERCENT_KEY, value: 0 },
      ]);
      expect(state.values.customerSuccessRate).toBe(99.7);
      expect(state.values.regressionHealth).toBe("regression-removed");
    });

    it("harmful path: scaling new-version instances at meaningful rollout worsens dependency pressure vs baseline", () => {
      const baseline = runScenario(REGRESSION_ACTIVE_MS + 20_000);
      const scaled = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: NEW_VERSION_INSTANCE_COUNT_KEY, value: 16 },
      ]);

      expect(scaled.values.sharedDependencyPressure).toBeGreaterThan(
        baseline.values.sharedDependencyPressure as number,
      );
      expect(scaled.values.newVersionErrorRate).toBeGreaterThan(
        baseline.values.newVersionErrorRate as number,
      );
      expect(scaled.values.regressionHealth).toBe("unresolved");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.rolloutState).toBe("critical");
    });

    it("partial/masked path: circuit-breaker dependency protection improves pressure but leaves the new version regressed", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "circuit-breaker" },
      ]);
      expect(state.values.newVersionErrorRate).toBeGreaterThan(1);
      expect(state.values.regressionHealth).toBe("masked");
    });

    it("partial/masked path: rate-limit dependency protection is weaker than circuit-breaker", () => {
      const circuitBreaker = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "circuit-breaker" },
      ]);
      const rateLimit = runScenario(REGRESSION_ACTIVE_MS + 20_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "rate-limit" },
      ]);
      expect(rateLimit.values.sharedDependencyPressure).toBeGreaterThan(
        circuitBreaker.values.sharedDependencyPressure as number,
      );
    });

    it("delayed consequence: sustained unmitigated regression saturates the shared dependency and contaminates the old version", () => {
      const beforeSecondWave = runScenario(REGRESSION_ACTIVE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.sharedDependencyPressure).toBeGreaterThanOrEqual(48);
      expect(beforeSecondWave.values.oldVersionErrorRate).toBe(0.3);

      const afterSecondWave = runScenario(DEPENDENCY_SATURATION_MS + 5_000);
      expect(afterSecondWave.values.sharedDependencyPressure).toBe(99);
      expect(afterSecondWave.values.oldVersionErrorRate).toBeGreaterThan(0.3);
      expect(afterSecondWave.values.oldVersionErrorRate).toBe(14.5);
    });

    it("isolated traffic routing protects the old version from the second-wave dependency saturation", () => {
      const isolated = runScenario(DEPENDENCY_SATURATION_MS + 5_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: TRAFFIC_ROUTING_MODE_KEY, value: "isolated-pool" },
      ]);
      expect(isolated.values.oldVersionErrorRate).toBe(0.3);
      // The new version itself is still regressed — isolation contains
      // the secondary consequence, not the regression.
      expect(isolated.values.regressionHealth).toBe("unresolved");
    });

    it("stays active (never auto-fails) even after customer success rate remains at or below 80% past the old sustained window", () => {
      const state = runScenario(DEPENDENCY_SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        partialRolloutRegressionSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak new-version error rate and shared dependency pressure generically via numericWatchFields", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 1_000);
      expect(state.peaks.peakValues.newVersionErrorRate).toBe(8.4);
      expect(state.peaks.peakValues.sharedDependencyPressure).toBe(48);
    });

    it("tracks monthly infrastructure cost that increases with instance count and dependency protection", () => {
      let state = createInitialState(partialRolloutRegressionSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = partialRolloutRegressionSimulation.tickMs;
      state = simulate(
        partialRolloutRegressionSimulation,
        state,
        { id: "scale-new-version", timestampMs: 0, controlKey: NEW_VERSION_INSTANCE_COUNT_KEY, value: 32 },
        tickMs,
      ).state;
      state = simulate(
        partialRolloutRegressionSimulation,
        state,
        { id: "protect-dependency", timestampMs: tickMs, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "circuit-breaker" },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 980 + 70);
    });
  });

  describe("Candidate-declared completion (no acceptable tier)", () => {
    it("rollback, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLBACK_TO_OLD_VERSION_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(partialRolloutRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("feature-flag disable, sustained, is also eligible for an OPTIMAL-tier Finish (alternate good path)", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: REGRESSED_FEATURE_ENABLED_KEY, value: false },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(partialRolloutRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("rollout-zeroed, sustained, is also eligible for an OPTIMAL-tier Finish (alternate good path)", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLOUT_PERCENT_KEY, value: 0 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(partialRolloutRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("dependency protection (masked, regression not removed) is never eligible for any Finish tier", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "circuit-breaker" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(partialRolloutRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLBACK_TO_OLD_VERSION_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        partialRolloutRegressionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal (rollback) -> resolved/optimal", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLBACK_TO_OLD_VERSION_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(partialRolloutRegressionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(partialRolloutRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from masked (dependency protection without removing the regression) -> declared_unstable", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "circuit-breaker" },
      ]);
      const result = evaluateCandidateDeclaredFinish(partialRolloutRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode, even past the old sustained failure window", () => {
      const state = runScenario(DEPENDENCY_SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(partialRolloutRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at incident start does not resolve prematurely", () => {
      const state = runScenario(1_000);
      const eligibility = evaluateCompletionEligibility(partialRolloutRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(partialRolloutRegressionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish right after the regression fires also does not resolve", () => {
      const state = runScenario(REGRESSION_ACTIVE_MS + 500);
      const eligibility = evaluateCompletionEligibility(partialRolloutRegressionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: REGRESSED_FEATURE_ENABLED_KEY, value: false },
      ];
      const runA = runScenario(REGRESSION_ACTIVE_MS + 40_000, actions);
      const runB = runScenario(REGRESSION_ACTIVE_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (rollback), alternate-good (feature-flag), baseline, harmful, and masked paths with coherent ordering", () => {
      const rollbackState = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: ROLLBACK_TO_OLD_VERSION_KEY, value: true },
      ]);
      const rollbackFinish = evaluateCandidateDeclaredFinish(partialRolloutRegressionSimulation, rollbackState);
      const rollbackScore = scoreAuthoredAttempt(
        PARTIAL_ROLLOUT_REGRESSION_SCORING,
        extractFinishScoringInputs(partialRolloutRegressionSimulation, rollbackFinish),
      );

      const featureFlagState = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: REGRESSED_FEATURE_ENABLED_KEY, value: false },
      ]);
      const featureFlagFinish = evaluateCandidateDeclaredFinish(
        partialRolloutRegressionSimulation,
        featureFlagState,
      );
      const featureFlagScore = scoreAuthoredAttempt(
        PARTIAL_ROLLOUT_REGRESSION_SCORING,
        extractFinishScoringInputs(partialRolloutRegressionSimulation, featureFlagFinish),
      );

      // Baseline/harmful/masked paths never reach Finish eligibility —
      // score them as never-resolved attempts via the unresolved
      // terminal override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(REGRESSION_ACTIVE_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        PARTIAL_ROLLOUT_REGRESSION_SCORING,
        extractScoringInputs(partialRolloutRegressionSimulation, baselineState),
      );

      const harmfulState = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: NEW_VERSION_INSTANCE_COUNT_KEY, value: 32 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        PARTIAL_ROLLOUT_REGRESSION_SCORING,
        extractScoringInputs(partialRolloutRegressionSimulation, harmfulState),
      );

      const maskedState = runScenario(REGRESSION_ACTIVE_MS + 40_000, [
        { atMs: REGRESSION_ACTIVE_MS + 1_000, controlKey: DEPENDENCY_PROTECTION_MODE_KEY, value: "circuit-breaker" },
      ]);
      const maskedScore = scoreAuthoredAttempt(
        PARTIAL_ROLLOUT_REGRESSION_SCORING,
        extractScoringInputs(partialRolloutRegressionSimulation, maskedState),
      );

      // Both genuine fixes (rollback, feature-flag disable) are applied
      // one tick after incident start in this test, so recovery/
      // customerImpact/reliability legitimately tie between them —
      // dataIntegrity (finalStringNotEquals on regressionHealth) also
      // ties since both reach "regression-removed." This is intentional:
      // the two paths are DESIGNED to score identically well, proving
      // neither is secretly worse (phase6c.md's "real distinct values
      // proving both paths are genuinely safe, not one secretly worse").
      expect(rollbackScore.total).toBe(featureFlagScore.total);
      expect(rollbackScore.total).toBe(865);
      expect(baselineScore.total).toBe(440);
      // The circuit breaker's infrastructure cost is real spend with no
      // offsetting improvement (the regression itself never gets fixed,
      // so this path never resolves either) — costEfficiency correctly
      // scores it slightly below doing nothing at all. Investigated per
      // section 17: this is NOT a "harmful > mitigation" inversion (the
      // regression's own error rate is genuinely better under circuit-
      // breaker than baseline — see the Runtime test above — scoring
      // only reflects that neither path ever reaches Finish eligibility,
      // so recovery/reliability tie at their unresolved floor and the
      // paid-for-but-ineffective protection loses on cost alone).
      expect(maskedScore.total).toBe(420);
      expect(maskedScore.total).toBeLessThan(baselineScore.total);
      // Verified (section 17): harmful (scaling into a regression that
      // also worsens shared-dependency pressure) never outscores doing
      // nothing — no "harmful > mitigation" inversion.
      expect(harmfulScore.total).toBe(350);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(rollbackScore.total).toBeGreaterThan(baselineScore.total);
      expect(rollbackScore.total).toBeGreaterThan(maskedScore.total);
    });

    it("scores the immediate zero-action Finish attempt as the unresolved baseline (low, not a hidden win)", () => {
      const state = runScenario(1_000);
      const score = scoreAuthoredAttempt(
        PARTIAL_ROLLOUT_REGRESSION_SCORING,
        extractScoringInputs(partialRolloutRegressionSimulation, state),
      );
      // Pre-incident, never-resolved: recovery/reliability hit their
      // unresolved terminal overrides (0 each); dataIntegrity scores the
      // full 200 points (regressionHealth is "unresolved" !=
      // "regression-removed", so finalStringNotEquals is true -> the
      // atMost:0 band); customerImpact/costEfficiency score at their
      // healthy/no-cost defaults, and operationalEfficiency starts at
      // its 50-point ceiling with no harmful/excess-configuration
      // penalties triggered.
      expect(score.total).toBe(440);
    });
  });
});
