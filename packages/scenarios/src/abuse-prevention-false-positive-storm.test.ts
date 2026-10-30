import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { abusePreventionFalsePositiveStorm } from "./abuse-prevention-false-positive-storm";
import {
  ABUSE_TRAFFIC_BLOCK_KEY,
  abusePreventionFalsePositiveStormSimulation,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
} from "./abuse-prevention-false-positive-storm/definition";
import { abusePreventionFalsePositiveStormCandidateUI } from "./abuse-prevention-false-positive-storm/candidate-ui";
import { ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING } from "./abuse-prevention-false-positive-storm/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  FALSE_POSITIVE_ONSET_MS,
  PATCHED_RULE_AVAILABLE_MS,
  SUSTAINED_FALSE_POSITIVES_MS,
} from "./abuse-prevention-false-positive-storm/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(abusePreventionFalsePositiveStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += abusePreventionFalsePositiveStormSimulation.tickMs
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
      abusePreventionFalsePositiveStormSimulation,
      state,
      action,
      abusePreventionFalsePositiveStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function buildScoringInputs(state: ReturnType<typeof runScenario>) {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: null,
    failedAtMs: state.failedAtMs,
    totalTimeInCriticalMs: state.customerImpact.totalTimeInCriticalMs,
    totalTimeInDegradedMs: state.customerImpact.totalTimeInDegradedMs,
    revenueLossUsd: state.customerImpact.revenueLossUsd,
    peakSeverityRank: state.peaks.peakSeverityRank,
    numberOfConfigurationChanges: state.numberOfConfigurationChanges,
    numberOfHarmfulChanges: state.numberOfHarmfulChanges,
    numberOfBeneficialChanges: state.numberOfBeneficialChanges,
    initialMonthlyInfrastructureCostUsd:
      abusePreventionFalsePositiveStormSimulation.infrastructureCost.baselineMonthlyUsd,
    finalMonthlyInfrastructureCostUsd: state.cost.currentMonthlyCostUsd,
    peakMonthlyInfrastructureCostUsd: state.peaks.peakMonthlyCostUsd,
    finalNumericValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>,
    peakNumericValues: state.peaks.peakValues,
    finalStringValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
  };
}

// Safe path 1: targeted rollback, engaged right after onset.
const SAFE_ROLLBACK_ACTIONS: TimedAction[] = [
  { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: DETECTION_RULE_VERSION_KEY, value: "v1-stable" },
];

// Safe path 3: trust-scored exemption, engaged right after onset.
const SAFE_EXEMPTION_ACTIONS: TimedAction[] = [
  { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: FALSE_POSITIVE_EXEMPTION_KEY, value: "exempt-flagged-legit" },
];

// Safe path 2: patched forward-fix, engaged once investigation has
// produced a validated patch.
const SAFE_PATCH_ACTIONS: TimedAction[] = [
  { atMs: PATCHED_RULE_AVAILABLE_MS + 1_000, controlKey: DETECTION_RULE_VERSION_KEY, value: "v3-patched" },
];

describe("Abuse-Prevention False Positive Storm", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(abusePreventionFalsePositiveStorm.isFree).toBe(false);
      expect(abusePreventionFalsePositiveStorm.library?.category).toBe("Security & Identity");
      expect(abusePreventionFalsePositiveStorm.library?.tags.length).toBeGreaterThan(0);
      expect(abusePreventionFalsePositiveStorm.library?.skills.length).toBeGreaterThan(0);
      expect(abusePreventionFalsePositiveStorm.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(abusePreventionFalsePositiveStormCandidateUI.metrics.length).toBeGreaterThanOrEqual(6);
      expect(abusePreventionFalsePositiveStormCandidateUI.controls.length).toBe(5);
      expect(abusePreventionFalsePositiveStormCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 flat nodes and 5 edges matching the spec", () => {
      expect(abusePreventionFalsePositiveStormSimulation.architecture.nodes.length).toBe(6);
      expect(abusePreventionFalsePositiveStormSimulation.architecture.edges.length).toBe(5);
    });

    it("the briefing explicitly states all four business invariants and the security invariant", () => {
      expect(abusePreventionFalsePositiveStorm.description).toMatch(/not remain blocked longer than necessary/i);
      expect(abusePreventionFalsePositiveStorm.description).toMatch(/must not be globally disabled merely to relieve false-positive pressure/i);
      expect(abusePreventionFalsePositiveStorm.description).toMatch(/targeted rollback or rule adjustment is preferred over a blanket bypass/i);
      expect(abusePreventionFalsePositiveStorm.description).toMatch(/recorded as a real, non-resetting consequence/i);
      expect(abusePreventionFalsePositiveStorm.description).toMatch(/must never be treated as a safe resolution/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of abusePreventionFalsePositiveStormSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control is exercised by at least one action classification rule", () => {
      const controlKeys = abusePreventionFalsePositiveStormSimulation.controls.map((c) => c.key);
      const classifiedKeys = new Set(
        abusePreventionFalsePositiveStormSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const key of controlKeys) {
        expect(classifiedKeys.has(key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(abusePreventionFalsePositiveStormSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.cumulativeAbuseRequestsAllowedCount).toBe(0);
      expect(state.values.legitimateUserSuccessRate).toBe(99.5);
    });

    it("false-positive onset triggers the incident while real abuse traffic is already present (independent axis)", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(FALSE_POSITIVE_ONSET_MS);
      expect(state.values.legitimateUserSuccessRate).toBeLessThan(90);
      // Abuse traffic rate is unchanged by the rule defect itself —
      // same ongoing background rate as before the incident.
      expect(state.values.abuseRequestsAllowedRate).toBe(0.5);
    });

    it("baseline (no action) blocks a large legitimate population but never exposes abuse", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("false-positives-baseline");
      expect(state.values.abuseProtectionStatus).toBe("false-positives-active");
      expect(state.values.legitimateUserSuccessRate).toBeLessThan(70);
      expect(state.values.cumulativeAbuseRequestsAllowedCount).toBe(0);
    });

    it("leaving the incident unaddressed long enough escalates into a materially worse blocked population (sustained window)", () => {
      const state = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 5_000);
      expect(state.transitions.incidentState).toBe("false-positives-sustained-unaddressed");
      const early = runScenario(FALSE_POSITIVE_ONSET_MS + 5_000);
      expect(state.values.legitimateUsersBlockedCount as number).toBeGreaterThan(
        early.values.legitimateUsersBlockedCount as number,
      );
    });

    describe("Required security-QA unsafe path: broad rate-limiter disablement", () => {
      it("legitimate-user availability improves while abuseProtectionStatus is bypassed and a historical count accumulates", () => {
        const baseline = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000);
        const disabled = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
        ]);
        expect(disabled.transitions.incidentState).toBe("rate-limiter-disabled");
        // Availability genuinely improves.
        expect(disabled.values.legitimateUserSuccessRate as number).toBeGreaterThan(
          baseline.values.legitimateUserSuccessRate as number,
        );
        // Security invariant is violated: real abuse is let through.
        expect(disabled.values.abuseProtectionStatus).toBe("protection-bypassed");
        expect(disabled.values.abuseRequestsAllowedRate as number).toBeGreaterThan(
          baseline.values.abuseRequestsAllowedRate as number,
        );
        // Historical security consequence accumulates.
        expect(disabled.values.cumulativeAbuseRequestsAllowedCount as number).toBeGreaterThan(0);
        // Can never resolve as safe via this path.
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, disabled);
        expect(eligibility).toEqual({ eligible: false });
        const finish = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, disabled);
        expect(finish.outcome).toBe("declared_unstable");
      });

      it("the historical count compounds the longer disablement is left active (sustained window)", () => {
        const earlyDisabled = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
        ]);
        const sustainedDisabled = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
        ]);
        expect(sustainedDisabled.values.cumulativeAbuseRequestsAllowedCount as number).toBeGreaterThan(
          earlyDisabled.values.cumulativeAbuseRequestsAllowedCount as number,
        );
      });

      it("even availability improving further once a patch is available does not make disablement safe", () => {
        const disabledDuringInvestigation = runScenario(PATCHED_RULE_AVAILABLE_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
        ]);
        expect(disabledDuringInvestigation.transitions.incidentState).toBe("rate-limiter-disabled-during-investigation");
        expect(disabledDuringInvestigation.values.abuseProtectionStatus).toBe("protection-bypassed");
        const eligibility = evaluateCompletionEligibility(
          abusePreventionFalsePositiveStormSimulation,
          disabledDuringInvestigation,
        );
        expect(eligibility).toEqual({ eligible: false });
      });

      it("stays active (never auto-fails) even after holding broad disablement past the old sustained window", () => {
        const state = runScenario(PATCHED_RULE_AVAILABLE_MS + 50_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
        ]);
        expect(state.status).not.toBe("failed");
        expect(state.failedAtMs).toBeNull();
        expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
          abusePreventionFalsePositiveStormSimulation.failureCondition.sustainedSeconds,
        );
      });

      it("partial relaxation is an equally unsafe, separately-tracked violation with a smaller blast radius", () => {
        const state = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "relaxed" },
        ]);
        expect(state.transitions.incidentState).toBe("rate-limiter-relaxed");
        expect(state.values.abuseProtectionStatus).toBe("protection-bypassed");
        expect(state.values.cumulativeAbuseRequestsAllowedCount as number).toBeGreaterThan(0);
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Independent abuse signal: a second, separate axis from rateLimiterMode", () => {
      it("disabling the abuse-specific signal exposes abuse even while the rate limiter stays strict", () => {
        const state = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: ABUSE_TRAFFIC_BLOCK_KEY, value: "inactive" },
        ]);
        expect(state.transitions.incidentState).toBe("abuse-signal-disabled");
        expect(state.values.rateLimiterStatus).toBe("normal");
        expect(state.values.abuseProtectionStatus).toBe("protection-bypassed");
        expect(state.values.cumulativeAbuseRequestsAllowedCount as number).toBeGreaterThan(0);
      });
    });

    describe("Unreliable exemption trap: differentiation requires a live trust signal", () => {
      it("exempting flagged users without identity trust scoring cannot safely tell populations apart", () => {
        const state = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: IDENTITY_TRUST_SCORING_KEY, value: "disabled" },
          { atMs: FALSE_POSITIVE_ONSET_MS + 2_000, controlKey: FALSE_POSITIVE_EXEMPTION_KEY, value: "exempt-flagged-legit" },
        ]);
        expect(state.transitions.incidentState).toBe("exemption-unreliable");
        expect(state.values.abuseProtectionStatus).toBe("protection-bypassed");
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Legitimate degraded-but-safe state: trust-scored exemption", () => {
      it("real exemption with trust scoring enabled: legitimate relief, zero abuse exposure", () => {
        const state = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_EXEMPTION_ACTIONS);
        expect(state.transitions.incidentState).toBe("exemption-safe");
        expect(state.values.abuseProtectionStatus).toBe("targeted-fix-applied");
        expect(state.values.legitimateUserSuccessRate).toBeGreaterThan(90);
        expect(state.values.cumulativeAbuseRequestsAllowedCount).toBe(0);
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });
    });

    describe("Alternate strong paths: rollback vs patched forward-fix", () => {
      it("targeted rollback reaches optimal immediately, no elapsed-time gate", () => {
        const state = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_ROLLBACK_ACTIONS);
        expect(state.transitions.incidentState).toBe("targeted-rollback-fixed");
        expect(state.values.abuseProtectionStatus).toBe("fully-restored");
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      });

      it("patched forward-fix is NOT reachable before investigation has produced a validated patch", () => {
        const tooEarly = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
          { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: DETECTION_RULE_VERSION_KEY, value: "v3-patched" },
        ]);
        expect(tooEarly.transitions.incidentState).not.toBe("patched-forward-fix");
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, tooEarly);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("patched forward-fix reaches optimal once investigation has completed", () => {
        const state = runScenario(PATCHED_RULE_AVAILABLE_MS + 30_000, SAFE_PATCH_ACTIONS);
        expect(state.transitions.incidentState).toBe("patched-forward-fix");
        expect(state.values.abuseProtectionStatus).toBe("fully-restored");
        const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      });
    });

    it("tracks peak historical exposure generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 5_000, [
        { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
      ]);
      expect(state.peaks.peakValues.cumulativeAbuseRequestsAllowedCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.legitimateUsersBlockedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("exemption-safe is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_EXEMPTION_ACTIONS);
      const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      const finish = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("acceptable");
    });

    it("targeted-rollback-fixed is Finish-eligible as optimal", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_ROLLBACK_ACTIONS);
      const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("baseline (false positives active, no action) is never Finish-eligible at any tier", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS + 20_000);
      const eligibility = evaluateCompletionEligibility(abusePreventionFalsePositiveStormSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("a sustained-but-not-eligible broad-disablement run still resolves to declared_unstable in candidate_declared mode", () => {
      const state = runScenario(PATCHED_RULE_AVAILABLE_MS + 50_000, [
        { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
      ]);
      const result = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (targeted rollback) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_ROLLBACK_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      const inputs = extractFinishScoringInputs(abusePreventionFalsePositiveStormSimulation, result);
      const score = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL SCORE (rollback)", JSON.stringify(score));
    });

    it("alternate optimal path (patched forward-fix) also scores near-maximum", () => {
      const state = runScenario(PATCHED_RULE_AVAILABLE_MS + 30_000, SAFE_PATCH_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, state);
      const inputs = extractFinishScoringInputs(abusePreventionFalsePositiveStormSimulation, result);
      const score = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL SCORE (patched forward-fix)", JSON.stringify(score));
    });

    it("acceptable path (trust-scored exemption) scores well but below optimal", () => {
      const optimalState = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_ROLLBACK_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(abusePreventionFalsePositiveStormSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, optimalInputs);

      const acceptableState = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_EXEMPTION_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(abusePreventionFalsePositiveStormSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThan(0);
      expect(acceptableScore.breakdown.reliability).toBeLessThan(optimalScore.breakdown.reliability);
      console.log("ACCEPTABLE SCORE (exemption)", JSON.stringify(acceptableScore));
    });

    // Regression coverage for phase-6e1-scoring-closeout.md: the
    // patched-forward-fix OPTIMAL path genuinely scores BELOW the
    // acceptable-tier exemption path's total (750 < 810). This is
    // intentional tier/score divergence (Option D in the closeout),
    // not a defect — patched forward-fix cannot be applied until
    // PATCHED_RULE_AVAILABLE_MS (360s after onset, real investigation
    // time), so it pays a real recovery-time cost and a real
    // revenueLossUsd cost that the fast exemption path never pays,
    // while dataIntegrity/reliability (the security-correctness
    // dimensions) stay identical to the rollback-optimal path,
    // correctly reflecting that the end-state itself is equally safe.
    // This test exists so a future report cannot re-surface this
    // divergence as an unexplained anomaly.
    it("patched forward-fix (optimal) scores below the acceptable-tier exemption path's total, for a specific, legitimate reason: real elapsed investigation time and real accrued revenue loss, not a security/correctness gap", () => {
      const patchedState = runScenario(PATCHED_RULE_AVAILABLE_MS + 30_000, SAFE_PATCH_ACTIONS);
      const patchedResult = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, patchedState);
      const patchedInputs = extractFinishScoringInputs(abusePreventionFalsePositiveStormSimulation, patchedResult);
      const patchedScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, patchedInputs);

      const acceptableState = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_EXEMPTION_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(abusePreventionFalsePositiveStormSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(abusePreventionFalsePositiveStormSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, acceptableInputs);

      expect(patchedResult.completionTier).toBe("optimal");
      expect(acceptableResult.completionTier).toBe("acceptable");

      // The divergence is real and reproducible.
      expect(patchedScore.total).toBeLessThan(acceptableScore.total);

      // It is driven by recovery + customerImpact (real elapsed-time /
      // revenue-loss cost of waiting for PATCHED_RULE_AVAILABLE_MS)...
      expect(patchedScore.breakdown.recovery).toBeLessThan(acceptableScore.breakdown.recovery);
      expect(patchedScore.breakdown.customerImpact).toBeLessThan(acceptableScore.breakdown.customerImpact);

      // ...and NEVER by a security/correctness gap: patched
      // forward-fix's dataIntegrity and reliability must be at or
      // above the acceptable path's, since the underlying defect is
      // genuinely fixed (not merely worked around).
      expect(patchedScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(
        acceptableScore.breakdown.dataIntegrity,
      );
      expect(patchedScore.breakdown.reliability).toBeGreaterThanOrEqual(
        acceptableScore.breakdown.reliability,
      );

      console.log("PATCHED vs ACCEPTABLE", JSON.stringify({ patchedScore, acceptableScore }));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (broad rate-limiter disablement) scores WORSE on dataIntegrity+reliability than the baseline despite better availability", () => {
      const baselineState = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 60_000);
      const baselineInputs = buildScoringInputs(baselineState);
      const baselineScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, baselineInputs);

      const disabledState = runScenario(SUSTAINED_FALSE_POSITIVES_MS + 60_000, [
        { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: RATE_LIMITER_MODE_KEY, value: "disabled" },
      ]);
      const disabledInputs = buildScoringInputs(disabledState);
      const disabledScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, disabledInputs);

      // Availability-good / security-bad: disablement has materially
      // better raw legitimate-user success rate...
      expect(disabledState.values.legitimateUserSuccessRate as number).toBeGreaterThan(
        baselineState.values.legitimateUserSuccessRate as number,
      );
      // ...but scores strictly worse on the dimensions that matter.
      // availability-good / security-bad must never score as safe.
      expect(disabledScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(disabledScore.breakdown.reliability).toBeLessThanOrEqual(baselineScore.breakdown.reliability);
      expect(disabledScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (disabled) SCORE", JSON.stringify(disabledScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("the unreliable-exemption trap scores worse on dataIntegrity than the plain baseline", () => {
      const baselineState = runScenario(FALSE_POSITIVE_ONSET_MS + 60_000);
      const baselineInputs = buildScoringInputs(baselineState);
      const baselineScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, baselineInputs);

      const unreliableState = runScenario(FALSE_POSITIVE_ONSET_MS + 60_000, [
        { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: IDENTITY_TRUST_SCORING_KEY, value: "disabled" },
        { atMs: FALSE_POSITIVE_ONSET_MS + 2_000, controlKey: FALSE_POSITIVE_EXEMPTION_KEY, value: "exempt-flagged-legit" },
      ]);
      const unreliableInputs = buildScoringInputs(unreliableState);
      const unreliableScore = scoreAuthoredAttempt(ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING, unreliableInputs);

      expect(unreliableScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      console.log("UNRELIABLE-EXEMPTION SCORE", JSON.stringify(unreliableScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_ROLLBACK_ACTIONS);
      const runB = runScenario(FALSE_POSITIVE_ONSET_MS + 30_000, SAFE_ROLLBACK_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("abuseTrafficBlock control: real, wired independent mechanic", () => {
    it("disabling the independent abuse signal is strictly worse than keeping it active, at equal elapsed time, even without touching rateLimiterMode", () => {
      const withSignal = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000);
      const withoutSignal = runScenario(FALSE_POSITIVE_ONSET_MS + 10_000, [
        { atMs: FALSE_POSITIVE_ONSET_MS + 1_000, controlKey: ABUSE_TRAFFIC_BLOCK_KEY, value: "inactive" },
      ]);
      expect(withoutSignal.values.cumulativeAbuseRequestsAllowedCount as number).toBeGreaterThan(
        withSignal.values.cumulativeAbuseRequestsAllowedCount as number,
      );
    });
  });
});
