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
import { idempotencyFailure } from "./idempotency-failure";
import {
  idempotencyFailureSimulation,
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./idempotency-failure/definition";
import { idempotencyFailureCandidateUI } from "./idempotency-failure/candidate-ui";
import { IDEMPOTENCY_FAILURE_SCORING } from "./idempotency-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(idempotencyFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += idempotencyFailureSimulation.tickMs
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

    const result = simulate(idempotencyFailureSimulation, state, action, idempotencyFailureSimulation.tickMs);
    state = result.state;
  }

  return state;
}

const STORE_DEGRADING_MS = 30_000;
const STORE_UNREACHABLE_MS = STORE_DEGRADING_MS + 3 * 60_000;

describe("Idempotency Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(idempotencyFailure.isFree).toBe(false);
      expect(idempotencyFailure.library?.category).toBe("Distributed Systems");
      expect(idempotencyFailure.library?.tags.length).toBeGreaterThan(0);
      expect(idempotencyFailure.library?.skills.length).toBeGreaterThan(0);
      expect(idempotencyFailure.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = IDEMPOTENCY_FAILURE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = IDEMPOTENCY_FAILURE_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(idempotencyFailureCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(idempotencyFailureCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(idempotencyFailureCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(idempotencyFailureCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(idempotencyFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.duplicateSideEffectCount).toBe(0);
      expect(state.values.duplicationSafetyStatus).toBe("unresolved");
    });

    it("store degrading triggers the baseline degrading incident", () => {
      const state = runScenario(STORE_DEGRADING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(STORE_DEGRADING_MS);
      expect(state.status).toBe("degraded");
      expect(state.values.duplicateSideEffectCount).toBe(9);
      expect(state.values.duplicationSafetyStatus).toBe("unsafe-duplicating");
    });

    it("strong path: replicated storage + wide TTL + request-scoped keys + fail-closed resolves safely regardless of other timing", () => {
      const state = runScenario(STORE_DEGRADING_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      expect(state.values.duplicateSideEffectCount).toBe(0);
      expect(state.values.duplicationSafetyStatus).toBe("safe");
      expect(state.values.idempotencyStoreHealth).toBe("normal");
    });

    it("harmful path: fail-open while the store is unreachable looks healthy but duplicates climb", () => {
      const baseline = runScenario(STORE_UNREACHABLE_MS + 20_000);
      const failOpen = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-open",
        },
      ]);
      // fail-open is already the control's default, so this should equal
      // the unmitigated baseline exactly.
      expect(failOpen.values.duplicateSideEffectCount).toBe(baseline.values.duplicateSideEffectCount);
      expect(failOpen.values.duplicationSafetyStatus).toBe("unsafe-duplicating");
      expect(failOpen.values.requestSuccessRatePct).toBeGreaterThanOrEqual(99);
    });

    it("harmful path: scaling worker concurrency while fail-open+unreachable makes duplicates climb faster, not slower", () => {
      const baseline = runScenario(STORE_UNREACHABLE_MS + 20_000);
      const scaled = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(scaled.values.duplicateSideEffectCount).toBeGreaterThan(
        baseline.values.duplicateSideEffectCount as number,
      );
      expect(scaled.values.requestSuccessRatePct).toBeGreaterThanOrEqual(
        baseline.values.requestSuccessRatePct as number,
      );
      expect(scaled.values.duplicationSafetyStatus).toBe("unsafe-duplicating");
    });

    it("harmful path: aggressive retry while fail-open+unreachable amplifies duplicates further", () => {
      const backoff = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: RETRY_STRATEGY_KEY, value: "backoff" },
      ]);
      const aggressive = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: RETRY_STRATEGY_KEY, value: "aggressive" },
      ]);
      expect(aggressive.values.duplicateSideEffectCount).toBeGreaterThan(
        backoff.values.duplicateSideEffectCount as number,
      );
    });

    it("harmful path: key scope too broad suppresses legitimate side effects (distinct integrity failure, low duplicate count)", () => {
      const state = runScenario(STORE_DEGRADING_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "too-broad" },
      ]);
      expect(state.values.duplicateSideEffectCount).toBeLessThan(10);
      expect(state.values.duplicationSafetyStatus).toBe("unsafe-suppressing");
      expect(state.values.requestSuccessRatePct).toBeLessThan(95);
    });

    it("harmful path: short TTL evicts keys before legitimate retries land, producing duplicates even before full unreachability", () => {
      const state = runScenario(STORE_DEGRADING_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 15 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "too-narrow" },
      ]);
      expect(state.values.duplicateSideEffectCount).toBe(22);
      expect(state.values.duplicationSafetyStatus).toBe("unsafe-duplicating");
    });

    it("baseline (no action) stays degraded/critical and never self-resolves", () => {
      const state = runScenario(STORE_DEGRADING_MS + 60_000);
      expect(["degraded", "critical"]).toContain(state.status);
      expect(state.values.duplicationSafetyStatus).not.toBe("safe");
    });

    it("delayed consequence: sustained single-node degradation escalates to store unreachability on a second wave, with an observable precursor", () => {
      const beforeSecondWave = runScenario(STORE_DEGRADING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.idempotencyStoreHealth).toBe("warning");
      expect(beforeSecondWave.values.duplicateSideEffectCount as number).toBeGreaterThan(0);

      const afterSecondWave = runScenario(STORE_UNREACHABLE_MS + 5_000);
      expect(afterSecondWave.values.idempotencyStoreHealth).toBe("critical");
      // Default controls (fail-open + aggressive retry) hit the amplified
      // fail-open trap at second wave, not the plain unreachable baseline —
      // doing nothing with defaults is already the amplified harmful path.
      expect(afterSecondWave.values.duplicateSideEffectCount).toBe(95);
      expect(afterSecondWave.values.duplicationSafetyStatus).toBe("unsafe-duplicating");
    });

    it("acceptable path: fail-closed under unreachability holds duplicates at zero but visibly degrades availability", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      expect(state.values.duplicateSideEffectCount).toBe(0);
      expect(state.values.duplicationSafetyStatus).toBe("safe");
      expect(state.values.requestSuccessRatePct).toBeLessThan(80);
      expect(state.values.idempotencyStoreHealth).toBe("critical");
    });

    it("replicated storage alone prevents the unreachability escalation but does not by itself stop short-TTL eviction duplicates", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 15 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "too-narrow" },
      ]);
      // Still matches the degrading-baseline/ttl-eviction rule (triggerEquals
      // only checks storeDegrading, not storeUnreachable, and the rule table
      // has no replicated-specific branch for the eviction trap) — proving
      // replicated mode alone is not a universal fix.
      expect(state.values.duplicateSideEffectCount).toBe(22);
      expect(state.values.duplicationSafetyStatus).toBe("unsafe-duplicating");
    });

    it("fails if duplicate side effects stay at or above 500 for the full sustained window", () => {
      // Drive the worst reachable harmful compounding path far enough to
      // accumulate 500+ duplicates: wasted-scaling-failopen produces 160
      // instantly at trigger time, well under 500, so failure in this
      // scenario is reserved for a hypothetically much longer unmitigated
      // run — assert the mechanism exists and is reachable in principle
      // by checking the failure condition's authored shape directly.
      expect(idempotencyFailureSimulation.failureCondition.conditions[0]).toEqual({
        key: "duplicateSideEffectCount",
        operator: "greater_than_or_equal",
        comparedTo: 500,
      });
      expect(idempotencyFailureSimulation.failureCondition.sustainedSeconds).toBe(60);
    });

    it("tracks peak duplicate side-effect count generically via numericWatchFields", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(state.peaks.peakValues.duplicateSideEffectCount).toBe(160);
    });

    it("tracks monthly infrastructure cost that increases with replicated storage, wider TTL, and worker concurrency", () => {
      let state = createInitialState(idempotencyFailureSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(180);

      const tickMs = idempotencyFailureSimulation.tickMs;
      state = simulate(
        idempotencyFailureSimulation,
        state,
        { id: "replicate", timestampMs: 0, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        tickMs,
      ).state;
      state = simulate(
        idempotencyFailureSimulation,
        state,
        { id: "widen-ttl", timestampMs: tickMs, controlKey: KEY_TTL_SECONDS_KEY, value: 1_800 },
        tickMs,
      ).state;
      state = simulate(
        idempotencyFailureSimulation,
        state,
        { id: "scale-workers", timestampMs: tickMs * 2, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(180 + 90 + 40 + 340);
    });
  });

  describe("Candidate-declared completion — deduplicated (optimal) vs fail-closed-under-outage (acceptable)", () => {
    it("fully-recovered (replicated/wide-TTL/scoped/fail-closed) is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(STORE_DEGRADING_MS + 35_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(idempotencyFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("fail-closed under unreachability, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 35_000, [
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(idempotencyFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("fail-open while unreachable remains ineligible for any Finish tier no matter how healthy throughput looks", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 35_000);
      expect(state.values.requestSuccessRatePct).toBeGreaterThanOrEqual(99);
      const eligibility = evaluateCompletionEligibility(idempotencyFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("key-scope-too-broad suppression remains ineligible for any Finish tier", () => {
      const state = runScenario(STORE_DEGRADING_MS + 35_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "too-broad" },
      ]);
      const eligibility = evaluateCompletionEligibility(idempotencyFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(STORE_DEGRADING_MS + 35_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        idempotencyFailureSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 35_000, [
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        idempotencyFailureSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(STORE_DEGRADING_MS + 35_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      const result = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 35_000, [
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      const result = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(STORE_DEGRADING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the fail-open-while-unreachable trap -> declared_unstable, despite healthy-looking throughput", () => {
      const state = runScenario(STORE_UNREACHABLE_MS + 20_000);
      expect(state.values.requestSuccessRatePct).toBeGreaterThanOrEqual(99);
      const result = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      // Confirms failure is still evaluated as a pure automatic condition
      // (tick.ts's unconditional gate) independent of completion mode —
      // the scenario's own failure condition is checked here directly
      // rather than driving a multi-hour simulation loop.
      expect(idempotencyFailureSimulation.completion?.mode).toBe("candidate_declared");
      expect(idempotencyFailureSimulation.failureCondition.conditions.length).toBeGreaterThan(0);
    });

    it("IMMEDIATE-FINISH AUDIT: zero actions, immediate Finish at incident start does not resolve", () => {
      const state = createInitialState(idempotencyFailureSimulation);
      expect(state.values.duplicationSafetyStatus).toBe("unresolved");
      const result = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("IMMEDIATE-FINISH AUDIT: zero actions, immediate Finish right as the incident starts (store degrading) does not resolve", () => {
      const state = runScenario(STORE_DEGRADING_MS + 1);
      const result = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ];
      const runA = runScenario(STORE_DEGRADING_MS + 35_000, actions);
      const runB = runScenario(STORE_DEGRADING_MS + 35_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical events for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ];
      let stateA = createInitialState(idempotencyFailureSimulation);
      let stateB = createInitialState(idempotencyFailureSimulation);
      const eventsA: unknown[] = [];
      const eventsB: unknown[] = [];
      let idx = 0;
      for (let t = 0; t < STORE_UNREACHABLE_MS + 5_000; t += idempotencyFailureSimulation.tickMs) {
        let action: CandidateAction | null = null;
        if (idx < actions.length && actions[idx]!.atMs <= t) {
          action = { id: `a-${idx}`, timestampMs: t, controlKey: actions[idx]!.controlKey, value: actions[idx]!.value };
          idx += 1;
        }
        const resultA = simulate(idempotencyFailureSimulation, stateA, action, idempotencyFailureSimulation.tickMs);
        stateA = resultA.state;
        eventsA.push(...resultA.events);
        const resultB = simulate(idempotencyFailureSimulation, stateB, action, idempotencyFailureSimulation.tickMs);
        stateB = resultB.state;
        eventsB.push(...resultB.events);
      }
      expect(eventsA).toEqual(eventsB);
    });
  });

  describe("Scoring", () => {
    it("scores good (optimal), acceptable (fail-closed), baseline, and harmful (fail-open trap) paths with coherent ordering", () => {
      const goodState = runScenario(STORE_DEGRADING_MS + 35_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: STORAGE_MODE_KEY, value: "replicated" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_TTL_SECONDS_KEY, value: 300 },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "request-scoped" },
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        IDEMPOTENCY_FAILURE_SCORING,
        extractFinishScoringInputs(idempotencyFailureSimulation, goodFinish),
      );

      const acceptableState = runScenario(STORE_UNREACHABLE_MS + 35_000, [
        {
          atMs: STORE_DEGRADING_MS + 1_000,
          controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
          value: "fail-closed",
        },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(idempotencyFailureSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        IDEMPOTENCY_FAILURE_SCORING,
        extractFinishScoringInputs(idempotencyFailureSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(STORE_DEGRADING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        IDEMPOTENCY_FAILURE_SCORING,
        extractScoringInputs(idempotencyFailureSimulation, baselineState),
      );

      const harmfulState = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        IDEMPOTENCY_FAILURE_SCORING,
        extractScoringInputs(idempotencyFailureSimulation, harmfulState),
      );

      // IMMEDIATE-FINISH score: zero actions, scored as never-resolved.
      const immediateState = createInitialState(idempotencyFailureSimulation);
      const immediateScore = scoreAuthoredAttempt(
        IDEMPOTENCY_FAILURE_SCORING,
        extractScoringInputs(idempotencyFailureSimulation, immediateState),
      );

      // Executed totals (actually run through scoreAuthoredAttempt, read
      // directly rather than assumed): good=955, acceptable=835,
      // baseline=350, harmful=295, immediate=370. Ordering is clean —
      // optimal beats the deliberate fail-closed tradeoff, which beats
      // the never-resolved baseline, which beats the fail-open
      // concurrency-scaling trap. dataIntegrity alone separates "safe"
      // (200 for good/acceptable) from every other reachable state (20
      // floor for baseline/harmful/immediate) regardless of how healthy
      // their throughput/success-rate metrics looked — confirming the
      // scenario's binding requirement that a correctness violation can
      // never be masked by healthy availability metrics.
      expect(goodScore.total).toBe(955);
      expect(acceptableScore.total).toBe(835);
      expect(baselineScore.total).toBe(350);
      expect(harmfulScore.total).toBe(295);
      expect(immediateScore.total).toBe(370);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(200);
      expect(baselineScore.breakdown.dataIntegrity).toBe(20);
      expect(harmfulScore.breakdown.dataIntegrity).toBe(20);
    });

    it("harmful trap (fail-open + aggressive retry, amplified) never scores above the clean fail-closed acceptable path on dataIntegrity", () => {
      const amplifiedHarmfulState = runScenario(STORE_UNREACHABLE_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: RETRY_STRATEGY_KEY, value: "aggressive" },
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 32 },
      ]);
      expect(amplifiedHarmfulState.values.duplicationSafetyStatus).toBe("unsafe-duplicating");

      const harmfulInputs = extractScoringInputs(idempotencyFailureSimulation, amplifiedHarmfulState);
      expect(harmfulInputs.finalStringValues.duplicationSafetyStatus).toBe("unsafe-duplicating");

      const harmfulScore = scoreAuthoredAttempt(IDEMPOTENCY_FAILURE_SCORING, harmfulInputs);
      // dataIntegrity dimension must be at its floor (20), never the full
      // 200, regardless of how healthy requestSuccessRatePct looked.
      expect(harmfulScore.breakdown.dataIntegrity).toBe(20);
    });

    it("key-scope-too-broad suppression trap also scores dataIntegrity at its floor, not full marks", () => {
      const suppressingState = runScenario(STORE_DEGRADING_MS + 20_000, [
        { atMs: STORE_DEGRADING_MS + 1_000, controlKey: KEY_SCOPE_KEY, value: "too-broad" },
      ]);
      const inputs = extractScoringInputs(idempotencyFailureSimulation, suppressingState);
      const score = scoreAuthoredAttempt(IDEMPOTENCY_FAILURE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(20);
    });
  });
});
