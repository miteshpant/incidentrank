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
import { dependencyRateLimitExhaustion } from "./dependency-rate-limit-exhaustion";
import {
  CACHING_ENABLED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
  dependencyRateLimitExhaustionSimulation,
} from "./dependency-rate-limit-exhaustion/definition";
import { dependencyRateLimitExhaustionCandidateUI } from "./dependency-rate-limit-exhaustion/candidate-ui";
import { DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING } from "./dependency-rate-limit-exhaustion/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dependencyRateLimitExhaustionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dependencyRateLimitExhaustionSimulation.tickMs
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
      dependencyRateLimitExhaustionSimulation,
      state,
      action,
      dependencyRateLimitExhaustionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const QUOTA_DRAWDOWN_MS = 30_000;
const PROVIDER_THROTTLING_MS = QUOTA_DRAWDOWN_MS + 4 * 60_000;

describe("Dependency Rate-Limit Exhaustion", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior scenario", () => {
      expect(dependencyRateLimitExhaustion.isFree).toBe(false);
      expect(dependencyRateLimitExhaustion.library?.category).toBe("Microservices & Dependencies");
      expect(dependencyRateLimitExhaustion.library?.tags.length).toBeGreaterThan(0);
      expect(dependencyRateLimitExhaustion.library?.skills.length).toBeGreaterThan(0);
      expect(dependencyRateLimitExhaustion.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(dependencyRateLimitExhaustionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(dependencyRateLimitExhaustionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(dependencyRateLimitExhaustionCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(dependencyRateLimitExhaustionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.quotaRemainingPct).toBe(100);
      expect(state.values.quotaOutcome).toBe("unresolved");
    });

    it("quota drawdown trigger fires at 30s with observable precursor metrics, before any 429s occur", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(QUOTA_DRAWDOWN_MS);
      expect(state.values.quotaStatus).toBe("warning");
      expect(state.values.quotaRemainingPct).toBeLessThan(100);
      expect(state.values.dependency429RatePerMin).toBe(0);
    });

    it("provider throttling begins at the second wave, only after the precursor has been visible for minutes", () => {
      const beforeThrottling = runScenario(PROVIDER_THROTTLING_MS - 1_000);
      expect(beforeThrottling.values.dependency429RatePerMin).toBe(0);
      expect(beforeThrottling.values.quotaStatus).toBe("warning");

      const state = runScenario(PROVIDER_THROTTLING_MS + 1_000);
      expect(state.values.quotaStatus).toBe("critical");
      expect(state.values.dependency429RatePerMin).toBeGreaterThan(0);
    });

    it("strong path: caching + request coalescing durably reduce call volume below the quota's burn rate", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 20_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.quotaStatus).toBe("normal");
      expect(state.values.dependency429RatePerMin).toBe(0);
      expect(state.values.quotaOutcome).toBe("sustained-under-quota");
      expect(state.values.cacheHitRatePct).toBeGreaterThan(0);
    });

    it("alternate good path: priority-only traffic policy also reaches sustained-under-quota", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 20_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: PRIORITY_TRAFFIC_POLICY_KEY, value: "priority-only" },
      ]);
      expect(state.values.quotaStatus).toBe("normal");
      expect(state.values.dependency429RatePerMin).toBe(0);
      expect(state.values.quotaOutcome).toBe("sustained-under-quota");
    });

    it("acceptable path: suppressing the optional feature also clears every customer-visible metric, but is tagged feature-suppressed, not sustained-under-quota", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 20_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: OPTIONAL_FEATURE_SUPPRESSED_KEY, value: true },
      ]);
      expect(state.values.quotaStatus).toBe("normal");
      expect(state.values.dependency429RatePerMin).toBe(0);
      expect(state.values.quotaOutcome).toBe("feature-suppressed");
    });

    it("harmful path (the trap): aggressive retries once throttling has begun make 429 rate and success rate WORSE than doing nothing, and fully exhaust the quota", () => {
      const baseline = runScenario(PROVIDER_THROTTLING_MS + 20_000);
      const aggressive = runScenario(PROVIDER_THROTTLING_MS + 20_000, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ]);

      expect(aggressive.values.dependency429RatePerMin).toBeGreaterThan(
        baseline.values.dependency429RatePerMin as number,
      );
      expect(aggressive.values.applicationSuccessRatePct).toBeLessThan(
        baseline.values.applicationSuccessRatePct as number,
      );
      expect(aggressive.values.quotaRemainingPct).toBe(0);
      expect(aggressive.values.quotaOutcome).toBe("exhausted");
      expect((baseline.values.quotaRemainingPct as number)).toBeGreaterThan(0);
    });

    it("partial relief: capping dependency concurrency alone helps but does not clear the incident", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 20_000, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: DEPENDENCY_CONCURRENCY_KEY, value: "capped" },
      ]);
      expect(state.values.quotaStatus).toBe("warning");
      expect(state.values.quotaOutcome).toBe("unresolved");
      const baseline = runScenario(PROVIDER_THROTTLING_MS + 20_000);
      expect(state.values.dependency429RatePerMin).toBeLessThan(
        baseline.values.dependency429RatePerMin as number,
      );
    });

    it("baseline (no action) stays critical post-throttling and never self-resolves before the sustained failure window elapses", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 30_000);
      expect(state.status).toBe("critical");
      expect(state.values.quotaStatus).toBe("critical");
    });

    it("fails if the quota is fully exhausted and sustained for the full failure window", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 1_000 + 61_000, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak 429 rate and peak retry volume generically via numericWatchFields", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 1_000, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ]);
      expect(state.peaks.peakValues.dependency429RatePerMin).toBeGreaterThan(0);
      expect(state.peaks.peakValues.retryVolumePerMin).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit (zero actions, Finish at the very start)", () => {
    it("immediately after incident start, quotaOutcome is still 'unresolved' and Finish does not resolve", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 1_000);
      expect(state.values.quotaOutcome).toBe("unresolved");
      const eligibility = evaluateCompletionEligibility(dependencyRateLimitExhaustionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });

      const result = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("at true t=0 (before the incident has even started), Finish still does not resolve, because quotaOutcome never equals the required tags", () => {
      const state = createInitialState(dependencyRateLimitExhaustionSimulation);
      expect(state.values.quotaOutcome).toBe("unresolved");
      const eligibility = evaluateCompletionEligibility(dependencyRateLimitExhaustionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("a genuinely beneficial action must still hold for the full 30s sustained window before Finish is eligible", () => {
      const justApplied = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 29_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      // Under 30s sustained -- not yet eligible.
      expect(justApplied.transitions.consecutiveSuccessSeconds).toBeLessThan(
        dependencyRateLimitExhaustionSimulation.successCondition.sustainedSeconds,
      );
      const eligibility = evaluateCompletionEligibility(
        dependencyRateLimitExhaustionSimulation,
        justApplied,
      );
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Completion mode: candidate_declared with acceptableCondition", () => {
    it("optimal success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        dependencyRateLimitExhaustionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable (feature-suppressed) does not auto-terminal either, and tracks its own sustained window", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: OPTIONAL_FEATURE_SUPPRESSED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        dependencyRateLimitExhaustionSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal (caching+coalescing) -> resolved/optimal", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable (feature-suppressed) -> resolved/acceptable", () => {
      const state = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: OPTIONAL_FEATURE_SUPPRESSED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe baseline (post-throttling, no mitigation) -> declared_unstable", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the aggressive-retry trap -> declared_unstable", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 20_000, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ]);
      const result = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(PROVIDER_THROTTLING_MS + 1_000 + 61_000, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(QUOTA_DRAWDOWN_MS + 40_000, actions);
      const runB = runScenario(QUOTA_DRAWDOWN_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state/score for the harmful aggressive-retry path run twice", () => {
      const actions: TimedAction[] = [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ];
      const runA = runScenario(PROVIDER_THROTTLING_MS + 20_000, actions);
      const runB = runScenario(PROVIDER_THROTTLING_MS + 20_000, actions);
      expect(runA).toEqual(runB);

      const scoreA = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractScoringInputs(dependencyRateLimitExhaustionSimulation, runA),
      );
      const scoreB = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractScoringInputs(dependencyRateLimitExhaustionSimulation, runB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores good (caching+coalescing), alternate-good (priority-only), acceptable (feature-suppressed), baseline, and harmful (aggressive retry) with coherent executed totals", () => {
      const goodState = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(dependencyRateLimitExhaustionSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractFinishScoringInputs(dependencyRateLimitExhaustionSimulation, goodFinish),
      );

      const altGoodState = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: PRIORITY_TRAFFIC_POLICY_KEY, value: "priority-only" },
      ]);
      const altGoodFinish = evaluateCandidateDeclaredFinish(
        dependencyRateLimitExhaustionSimulation,
        altGoodState,
      );
      const altGoodScore = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractFinishScoringInputs(dependencyRateLimitExhaustionSimulation, altGoodFinish),
      );

      const acceptableState = runScenario(QUOTA_DRAWDOWN_MS + 1_000 + 40_000, [
        { atMs: QUOTA_DRAWDOWN_MS + 1_000, controlKey: OPTIONAL_FEATURE_SUPPRESSED_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        dependencyRateLimitExhaustionSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractFinishScoringInputs(dependencyRateLimitExhaustionSimulation, acceptableFinish),
      );

      // Never-resolved attempts are scored via the unresolved terminal
      // override -- no synthetic resolvedAtMs is ever fabricated for
      // baseline or the harmful trap, since neither is Finish-eligible.
      // Both measured at the SAME elapsed time (50s post-throttling --
      // just under the 60s sustained-failure window, so the harmful
      // path is captured while still "critical," not yet auto-failed)
      // for a fair apples-to-apples revenue-loss comparison.
      const compareUntilMs = PROVIDER_THROTTLING_MS + 50_000;
      const baselineState = runScenario(compareUntilMs);
      const baselineScore = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractScoringInputs(dependencyRateLimitExhaustionSimulation, baselineState),
      );

      const harmfulState = runScenario(compareUntilMs, [
        { atMs: PROVIDER_THROTTLING_MS + 1_000, controlKey: RETRY_AGGRESSIVENESS_KEY, value: "aggressive" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractScoringInputs(dependencyRateLimitExhaustionSimulation, harmfulState),
      );

      // Immediate zero-action Finish: never eligible, so scored via the
      // unresolved terminal override exactly like baseline.
      const immediateState = runScenario(QUOTA_DRAWDOWN_MS + 1_000);
      const immediateScore = scoreAuthoredAttempt(
        DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
        extractScoringInputs(dependencyRateLimitExhaustionSimulation, immediateState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(goodScore.total).toBe(1000);
      expect(altGoodScore.total).toBe(1000);
      expect(acceptableScore.total).toBe(960);
      expect(baselineScore.total).toBe(510);
      expect(harmfulScore.total).toBe(445);
      expect(immediateScore.total).toBe(550);

      // The central assertion for this batch: the harmful aggressive-
      // retry trap must score measurably worse than the unmitigated
      // baseline, measured at the identical elapsed time -- not just
      // "fail to help," but genuinely worse, because it burns real
      // revenue-loss-rate dollars faster than doing nothing at all
      // (the authored revenueLossRatePerMinute for
      // "retry-accelerated-exhaustion" is 900/min vs. "provider-
      // throttling"'s 520/min).
      expect(harmfulState.customerImpact.revenueLossUsd).toBeGreaterThan(
        baselineState.customerImpact.revenueLossUsd,
      );
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      expect(harmfulScore.breakdown.customerImpact).toBeLessThan(
        baselineScore.breakdown.customerImpact,
      );

      // Both durable-fix paths outscore the acceptable feature-
      // suppression path on Data Integrity, since the acceptable path
      // reaches safety by removing a feature rather than making call
      // volume durably sustainable.
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(altGoodScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(160);
      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(altGoodScore.total).toBeGreaterThan(acceptableScore.total);

      // Immediate zero-action Finish never resolves, so -- like
      // baseline -- it is scored via the unresolved terminal override
      // on recovery/reliability, never an inflated "cheap win" for
      // doing nothing.
      expect(immediateScore.breakdown.recovery).toBe(0);
      expect(immediateScore.breakdown.reliability).toBe(0);

      expect(goodScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
