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
import { duplicateRequestProcessing } from "./duplicate-request-processing";
import {
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  duplicateRequestProcessingSimulation,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
} from "./duplicate-request-processing/definition";
import { duplicateRequestProcessingCandidateUI } from "./duplicate-request-processing/candidate-ui";
import { DUPLICATE_REQUEST_PROCESSING_SCORING } from "./duplicate-request-processing/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(duplicateRequestProcessingSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += duplicateRequestProcessingSimulation.tickMs
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
      duplicateRequestProcessingSimulation,
      state,
      action,
      duplicateRequestProcessingSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const LATENCY_RISING_MS = 30_000;
const SUSTAINED_RETRY_PRESSURE_MS = LATENCY_RISING_MS + 3 * 60_000;

describe("Duplicate Request Processing", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(duplicateRequestProcessing.isFree).toBe(false);
      expect(duplicateRequestProcessing.library?.category).toBe("Distributed Systems");
      expect(duplicateRequestProcessing.library?.tags.length).toBeGreaterThan(0);
      expect(duplicateRequestProcessing.library?.skills.length).toBeGreaterThan(0);
      expect(duplicateRequestProcessing.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DUPLICATE_REQUEST_PROCESSING_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DUPLICATE_REQUEST_PROCESSING_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(duplicateRequestProcessingCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(duplicateRequestProcessingCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(duplicateRequestProcessingCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(duplicateRequestProcessingSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.duplicateRequestRatePct).toBe(0);
      expect(state.values.duplicateSideEffectStatus).toBe("unresolved");
    });

    it("dependency slowdown triggers the baseline-ambiguous-ack incident", () => {
      const state = runScenario(LATENCY_RISING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(LATENCY_RISING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.duplicateRequestRatePct).toBe(18);
      expect(state.values.duplicateSideEffectStatus).toBe("duplicating");
      expect(state.values.serviceStatus).toBe("critical");
    });

    it("strong path: enforced idempotency + atomic transactions resolves duplication regardless of retry aggressiveness", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
        { atMs: LATENCY_RISING_MS + 2_000, controlKey: CLIENT_RETRY_COUNT_KEY, value: 10 },
      ]);
      expect(state.values.duplicateRequestRatePct).toBe(0);
      expect(state.values.duplicateSideEffectStatus).toBe("deduplicated");
      expect(state.values.serviceStatus).toBe("normal");
    });

    it("harmful path: shortening the client timeout increases duplicate rate above baseline", () => {
      const baseline = runScenario(LATENCY_RISING_MS + 20_000);
      const shortened = runScenario(LATENCY_RISING_MS + 20_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: CLIENT_TIMEOUT_MS_KEY, value: 500 },
      ]);

      expect(shortened.values.duplicateRequestRatePct).toBeGreaterThan(
        baseline.values.duplicateRequestRatePct as number,
      );
      expect(shortened.values.duplicateSideEffectStatus).toBe("duplicating");
      expect(shortened.values.serviceStatus).toBe("critical");
    });

    it("harmful path: raising client retry count increases duplicate rate above baseline", () => {
      const baseline = runScenario(LATENCY_RISING_MS + 20_000);
      const raised = runScenario(LATENCY_RISING_MS + 20_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: CLIENT_RETRY_COUNT_KEY, value: 10 },
      ]);

      expect(raised.values.duplicateRequestRatePct).toBeGreaterThan(
        baseline.values.duplicateRequestRatePct as number,
      );
      expect(raised.values.duplicateSideEffectStatus).toBe("duplicating");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(LATENCY_RISING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.duplicateSideEffectStatus).toBe("duplicating");
    });

    it("delayed consequence: sustained unmitigated retry pressure compounds duplication on a second wave", () => {
      const beforeSecondWave = runScenario(LATENCY_RISING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.retryVolumePerMin as number).toBeGreaterThan(0);
      expect(beforeSecondWave.values.duplicateRequestRatePct as number).toBeGreaterThan(0);

      const afterSecondWave = runScenario(SUSTAINED_RETRY_PRESSURE_MS + 5_000);
      expect(afterSecondWave.values.duplicateRequestRatePct).toBe(29);
      expect(afterSecondWave.values.retryVolumePerMin).toBe(520);
    });

    it("partial path: idempotency enforced without atomic transactions still leaks some duplicates", () => {
      const state = runScenario(LATENCY_RISING_MS + 20_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
      ]);
      expect(state.values.duplicateRequestRatePct).toBe(6);
      expect(state.values.duplicateSideEffectStatus).toBe("duplicating");
      expect(state.values.serviceStatus).toBe("warning");
    });

    it("partial path: logged-only idempotency gives visibility but no protection", () => {
      const state = runScenario(LATENCY_RISING_MS + 20_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "logged-only" },
      ]);
      expect(state.values.idempotencyHitRatePct).toBe(58);
      expect(state.values.duplicateRequestRatePct).toBe(24);
      expect(state.values.duplicateSideEffectStatus).toBe("duplicating");
    });

    it("harmful path: gateway retry enabled on top of sustained client retry pressure compounds duplication", () => {
      const withoutGatewayRetry = runScenario(SUSTAINED_RETRY_PRESSURE_MS + 5_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: GATEWAY_RETRY_ENABLED_KEY, value: false },
      ]);
      const withGatewayRetry = runScenario(SUSTAINED_RETRY_PRESSURE_MS + 5_000);

      expect(withGatewayRetry.values.duplicateSideEffectStatus).toBe("duplicating");
      expect(withGatewayRetry.values.duplicateRequestRatePct).toBe(29);
      expect(withoutGatewayRetry.values.duplicateRequestRatePct as number).toBeLessThan(
        withGatewayRetry.values.duplicateRequestRatePct as number,
      );
    });

    it("partial path: gateway request-dedup window alone gives relief but not full protection", () => {
      const state = runScenario(LATENCY_RISING_MS + 20_000, [
        {
          atMs: LATENCY_RISING_MS + 1_000,
          controlKey: REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
          value: 30,
        },
      ]);
      expect(state.values.duplicateRequestRatePct).toBe(16);
      expect(state.values.duplicateSideEffectStatus).toBe("duplicating");
    });

    it("fails if duplicate request rate stays at or above 50% for the full sustained window", () => {
      const state = runScenario(SUSTAINED_RETRY_PRESSURE_MS + 61_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: CLIENT_RETRY_COUNT_KEY, value: 10 },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak duplicate request rate generically via numericWatchFields", () => {
      const state = runScenario(LATENCY_RISING_MS + 1_000);
      expect(state.peaks.peakValues.duplicateRequestRatePct).toBe(18);
    });

    it("tracks monthly infrastructure cost that increases with retry count and dedup window", () => {
      let state = createInitialState(duplicateRequestProcessingSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(180);

      const tickMs = duplicateRequestProcessingSimulation.tickMs;
      state = simulate(
        duplicateRequestProcessingSimulation,
        state,
        { id: "raise-retries", timestampMs: 0, controlKey: CLIENT_RETRY_COUNT_KEY, value: 10 },
        tickMs,
      ).state;
      state = simulate(
        duplicateRequestProcessingSimulation,
        state,
        {
          id: "widen-window",
          timestampMs: tickMs,
          controlKey: REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
          value: 120,
        },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(180 + 90 + 55);
    });
  });

  describe("Phase 6.1: candidate-declared completion — no acceptable tier", () => {
    it("the fully-deduplicated state is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(duplicateRequestProcessingSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("enforced-without-atomic (still duplicating) never becomes eligible for any Finish tier", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
      ]);
      const eligibility = evaluateCompletionEligibility(duplicateRequestProcessingSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("dedup-window-only (still duplicating) never becomes eligible for any Finish tier", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        {
          atMs: LATENCY_RISING_MS + 1_000,
          controlKey: REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
          value: 120,
        },
      ]);
      const eligibility = evaluateCompletionEligibility(duplicateRequestProcessingSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        duplicateRequestProcessingSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
      ]);
      const result = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(LATENCY_RISING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the partial enforced-without-atomic state -> declared_unstable (still a real violation)", () => {
      const state = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
      ]);
      const result = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_RETRY_PRESSURE_MS + 61_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: CLIENT_RETRY_COUNT_KEY, value: 10 },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at incident start does not resolve prematurely", () => {
      // Before the dependency-slowdown trigger even fires: the system is
      // in its pre-incident healthy state, but duplicateSideEffectStatus
      // is "unresolved" (not "deduplicated"), so successCondition cannot
      // be satisfied by an empty/no-op start state.
      const state = createInitialState(duplicateRequestProcessingSimulation);
      const eligibility = evaluateCompletionEligibility(duplicateRequestProcessingSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish partway through the incident (no mitigation yet) does not resolve", () => {
      const state = runScenario(LATENCY_RISING_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
      ];
      const runA = runScenario(LATENCY_RISING_MS + 25_000, actions);
      const runB = runScenario(LATENCY_RISING_MS + 25_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (enforced+atomic), baseline, harmful (shortened timeout), and partial (enforced-without-atomic) paths with coherent ordering", () => {
      const goodState = runScenario(LATENCY_RISING_MS + 25_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: TRANSACTION_HANDLING_KEY, value: "atomic" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(duplicateRequestProcessingSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        DUPLICATE_REQUEST_PROCESSING_SCORING,
        extractFinishScoringInputs(duplicateRequestProcessingSimulation, goodFinish),
      );

      // Baseline/harmful/partial paths never reach Finish eligibility —
      // score them as never-resolved attempts via the unresolved
      // terminal override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(LATENCY_RISING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        DUPLICATE_REQUEST_PROCESSING_SCORING,
        extractScoringInputs(duplicateRequestProcessingSimulation, baselineState),
      );

      const harmfulState = runScenario(LATENCY_RISING_MS + 20_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: CLIENT_TIMEOUT_MS_KEY, value: 500 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        DUPLICATE_REQUEST_PROCESSING_SCORING,
        extractScoringInputs(duplicateRequestProcessingSimulation, harmfulState),
      );

      const partialState = runScenario(LATENCY_RISING_MS + 20_000, [
        { atMs: LATENCY_RISING_MS + 1_000, controlKey: IDEMPOTENCY_KEY_HANDLING_KEY, value: "enforced" },
      ]);
      const partialScore = scoreAuthoredAttempt(
        DUPLICATE_REQUEST_PROCESSING_SCORING,
        extractScoringInputs(duplicateRequestProcessingSimulation, partialState),
      );

      // Immediate zero-action Finish at incident start, scored directly
      // off the untouched pre-incident state (never resolved).
      const immediateState = createInitialState(duplicateRequestProcessingSimulation);
      const immediateScore = scoreAuthoredAttempt(
        DUPLICATE_REQUEST_PROCESSING_SCORING,
        extractScoringInputs(duplicateRequestProcessingSimulation, immediateState),
      );

      // NOTE (section 16/17 suspicious-score investigation): baseline,
      // partial (enforced-without-atomic), and immediate-zero-action-
      // Finish all tie at 370 here. This is legitimate, not a scoring
      // bug: none of the three ever reaches Finish eligibility
      // (resolvedAtMs stays null for all three), so recovery and
      // reliability both fall through to their authored
      // terminalOverrides.unresolved = 0 for every one of them — the
      // same pre-existing, already-accepted "unresolved" flattening
      // Missing Database Index's baseline/harmful paths also hit (see
      // that scenario's own scoring.ts/test notes). dataIntegrity
      // correctly penalizes all three identically (20/200) because all
      // three have duplicateSideEffectStatus still "duplicating" or
      // "unresolved" — a genuinely ongoing/unaddressed correctness
      // violation in every case, which is exactly what should tie here.
      // harmful scores LOWER than baseline (355 < 370) purely via
      // operationalEfficiency's harmful-change penalty (35 vs 50) — the
      // harmful control change itself is penalized even though its
      // consequence (worse duplicate rate) is not separately double
      // counted beyond dataIntegrity's already-flat 20. Investigated and
      // consistent with section 17's binding instruction.
      expect(goodScore.total).toBe(865);
      expect(baselineScore.total).toBe(370);
      expect(partialScore.total).toBe(370);
      expect(harmfulScore.total).toBe(355);
      expect(immediateScore.total).toBe(370);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
      // The partial (still-duplicating) path must never outscore the
      // fully-deduplicated path — correctness matters more than apparent
      // throughput/latency improvement.
      expect(goodScore.total).toBeGreaterThan(partialScore.total);
    });
  });
});
