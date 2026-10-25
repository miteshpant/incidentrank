import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { partialRegionalDependencyFailure } from "./partial-regional-dependency-failure";
import {
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  EU_ROUTING_MODE_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
  partialRegionalDependencyFailureSimulation,
  TIMEOUT_POLICY_MS_KEY,
  US_ROUTING_MODE_KEY,
} from "./partial-regional-dependency-failure/definition";
import { partialRegionalDependencyFailureCandidateUI } from "./partial-regional-dependency-failure/candidate-ui";
import { PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING } from "./partial-regional-dependency-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(partialRegionalDependencyFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;
  const tickMs = partialRegionalDependencyFailureSimulation.tickMs;

  for (let timeMs = 0; timeMs < untilMs; timeMs += tickMs) {
    // Apply every action due at this tick with zero elapsed time first
    // (simulate() only accepts one action per call), so multiple
    // same-instant actions (e.g. isolating two regions at once) all
    // take effect before this tick's single time-advancing call —
    // matching how the real client dispatches one action per control
    // change without losing a tick to each one.
    while (actionIndex < actions.length && actions[actionIndex]!.atMs <= timeMs) {
      const pending = actions[actionIndex]!;
      actionCounter += 1;
      const result = simulate(
        partialRegionalDependencyFailureSimulation,
        state,
        {
          id: `action-${actionCounter}`,
          timestampMs: timeMs,
          controlKey: pending.controlKey,
          value: pending.value,
        },
        0,
      );
      state = result.state;
      actionIndex += 1;
    }

    const result = simulate(partialRegionalDependencyFailureSimulation, state, null, tickMs);
    state = result.state;
  }

  return state;
}

const REGIONAL_DIVERGENCE_MS = 30_000;
const APAC_WORSENING_MS = REGIONAL_DIVERGENCE_MS + 2 * 60_000;

// Shorthand for applying the full region-scoped mitigation.
const REGIONAL_MITIGATION_ACTIONS: TimedAction[] = [
  { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
  { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: EU_ROUTING_MODE_KEY, value: "isolate" },
  { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: APAC_ROUTING_MODE_KEY, value: "isolate" },
];

// Shorthand for tripping the global circuit breaker (uniform mitigation).
const GLOBAL_BREAKER_ACTIONS: TimedAction[] = [
  { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
  { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: GLOBAL_CIRCUIT_BREAKER_KEY, value: true },
];

describe("Partial Regional Dependency Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(partialRegionalDependencyFailure.isFree).toBe(false);
      expect(partialRegionalDependencyFailure.library?.category).toBe(
        "Microservices & Dependencies",
      );
      expect(partialRegionalDependencyFailure.library?.tags.length).toBeGreaterThan(0);
      expect(partialRegionalDependencyFailure.library?.skills.length).toBeGreaterThan(0);
      expect(partialRegionalDependencyFailure.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(partialRegionalDependencyFailureCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(partialRegionalDependencyFailureCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(partialRegionalDependencyFailureCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(partialRegionalDependencyFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.usSuccessRate).toBe(99.8);
      expect(state.values.mitigationApproach).toBe("none");
    });

    it("regional divergence triggers the baseline incident with three distinct per-region states", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REGIONAL_DIVERGENCE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.usDependencyHealth).toBe("normal");
      expect(state.values.euDependencyHealth).toBe("warning");
      expect(state.values.apacDependencyHealth).toBe("critical");
      expect(state.values.usSuccessRate).toBe(99.8);
      expect(state.values.euSuccessRate).toBe(85.0);
      expect(state.values.apacSuccessRate).toBe(70.0);
    });

    it("strong path: region-scoped isolation of EU and APAC leaves US fully untouched", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, REGIONAL_MITIGATION_ACTIONS);
      expect(state.values.mitigationApproach).toBe("regional");
      expect(state.values.usSuccessRate).toBe(99.8);
      expect(state.values.usDependencyHealth).toBe("normal");
      expect(state.values.euDependencyHealth).not.toBe("critical");
      expect(state.values.apacDependencyHealth).not.toBe("critical");
    });

    it("required judgment: the global circuit breaker leaves the healthy US region measurably worse off than the region-scoped fix", () => {
      const regional = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, REGIONAL_MITIGATION_ACTIONS);
      const global = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, GLOBAL_BREAKER_ACTIONS);

      expect(global.values.usSuccessRate).toBeLessThan(regional.values.usSuccessRate as number);
      expect(global.values.globalCustomerSuccessRate).toBeLessThan(
        regional.values.globalCustomerSuccessRate as number,
      );
      expect(global.values.mitigationApproach).toBe("global");
      expect(regional.values.mitigationApproach).toBe("regional");
    });

    it("harmful path: isolating the healthy US region trades away working service for no benefit", () => {
      const baseline = runScenario(REGIONAL_DIVERGENCE_MS + 20_000);
      const usIsolated = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: US_ROUTING_MODE_KEY, value: "isolate" },
      ]);

      // US routing mode alone (no matching rule for just US isolated)
      // falls through to the baseline-shaped states since no rule
      // specifically matches US-isolate-only; confirm US's success did
      // not improve versus doing nothing, proving isolating a healthy
      // region has no upside captured anywhere in the rule table.
      expect(usIsolated.values.usSuccessRate as number).toBeLessThanOrEqual(
        baseline.values.usSuccessRate as number,
      );
    });

    it("harmful path: tightening the global timeout clips US without fixing APAC's intermittent failures", () => {
      const baseline = runScenario(REGIONAL_DIVERGENCE_MS + 20_000);
      const tightTimeout = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: TIMEOUT_POLICY_MS_KEY, value: 600 },
      ]);

      expect(tightTimeout.values.usSuccessRate as number).toBeLessThan(
        baseline.values.usSuccessRate as number,
      );
      expect(tightTimeout.values.apacDependencyHealth).toBe("critical");
      expect(tightTimeout.values.globalCustomerSuccessRate as number).toBeLessThan(
        baseline.values.globalCustomerSuccessRate as number,
      );
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.apacDependencyHealth).toBe("critical");
    });

    it("delayed consequence: unmitigated APAC failures worsen on a second wave, with a visible precursor beforehand", () => {
      const beforeSecondWave = runScenario(REGIONAL_DIVERGENCE_MS + 60_000);
      // Observable precursor already visible before the second wave
      // lands: APAC is already flagged critical and its success rate is
      // already well below US/EU.
      expect(beforeSecondWave.values.apacDependencyHealth).toBe("critical");
      expect(beforeSecondWave.values.apacSuccessRate as number).toBeLessThan(90);

      const afterSecondWave = runScenario(APAC_WORSENING_MS + 5_000);
      expect(afterSecondWave.values.apacSuccessRate).toBe(38.0);
      expect(afterSecondWave.values.globalCustomerSuccessRate).toBe(74.3);
    });

    it("partial path: isolating only APAC leaves EU's slowness untouched", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: APAC_ROUTING_MODE_KEY, value: "isolate" },
      ]);
      expect(state.values.apacDependencyHealth).toBe("warning");
      expect(state.values.euLatencyMs).toBe(3_800);
      expect(state.values.euSuccessRate).toBe(84.0);
    });

    it("partial path: isolating only EU leaves APAC's intermittent failures untouched", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: EU_ROUTING_MODE_KEY, value: "isolate" },
      ]);
      expect(state.values.euDependencyHealth).toBe("warning");
      expect(state.values.apacDependencyHealth).toBe("critical");
      expect(state.values.apacSuccessRate).toBe(70.0);
    });

    it("failure path: tripping the global breaker without fallback causes an outright outage and automatic failure", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 61_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: GLOBAL_CIRCUIT_BREAKER_KEY, value: true },
      ]);
      expect(state.values.globalCustomerSuccessRate).toBe(40.0);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak EU latency and peak fallback traffic generically via numericWatchFields", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 1_000);
      expect(state.peaks.peakValues.euLatencyMs).toBe(3_800);
    });
  });

  describe("Phase 6.1: two-tier completion — region-scoped (optimal) vs global breaker (acceptable)", () => {
    it("region-scoped mitigation, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, REGIONAL_MITIGATION_ACTIONS);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(
        partialRegionalDependencyFailureSimulation,
        state,
      );
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("global breaker trip, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, GLOBAL_BREAKER_ACTIONS);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(
        partialRegionalDependencyFailureSimulation,
        state,
      );
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("isolating only one region remains ineligible for any Finish tier", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: DEPENDENCY_FALLBACK_ENABLED_KEY, value: true },
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: EU_ROUTING_MODE_KEY, value: "isolate" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(
        partialRegionalDependencyFailureSimulation,
        state,
      );
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, REGIONAL_MITIGATION_ACTIONS);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        partialRegionalDependencyFailureSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, GLOBAL_BREAKER_ACTIONS);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        partialRegionalDependencyFailureSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, REGIONAL_MITIGATION_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(partialRegionalDependencyFailureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, GLOBAL_BREAKER_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(partialRegionalDependencyFailureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(partialRegionalDependencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 61_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: GLOBAL_CIRCUIT_BREAKER_KEY, value: true },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(partialRegionalDependencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate-Finish audit: zero actions at the very start of the incident does NOT resolve", () => {
      // Per phase6c.md section 9: test what happens if the candidate
      // makes zero changes and immediately clicks Finish at t=0, before
      // the incident has even started.
      const state = runScenario(1_000);
      expect(state.status).toBe("healthy");
      const eligibility = evaluateCompletionEligibility(
        partialRegionalDependencyFailureSimulation,
        state,
      );
      // At t=0 the pre-incident healthy defaults technically satisfy
      // the numeric success thresholds, but mitigationApproach is
      // "none" — neither "regional" nor "global" — so neither the
      // success nor acceptable condition is met, and Finish is NOT
      // eligible. This is intentional: mitigationApproach only ever
      // becomes "regional"/"global" once the candidate actually acts
      // during a real incident, so a pre-incident or just-triggered
      // zero-action state can never be mistaken for a legitimate
      // handback.
      expect(eligibility).toEqual({ eligible: false });

      const result = evaluateCandidateDeclaredFinish(partialRegionalDependencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate-Finish audit: zero actions right after the incident triggers also does NOT resolve", () => {
      const state = runScenario(REGIONAL_DIVERGENCE_MS + 1_000);
      expect(state.status).toBe("critical");
      const eligibility = evaluateCompletionEligibility(
        partialRegionalDependencyFailureSimulation,
        state,
      );
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(partialRegionalDependencyFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, REGIONAL_MITIGATION_ACTIONS);
      const runB = runScenario(REGIONAL_DIVERGENCE_MS + 20_000, REGIONAL_MITIGATION_ACTIONS);
      expect(runA).toEqual(runB);
    });

    it("produces identical events for the same action sequence run twice", () => {
      let stateA = createInitialState(partialRegionalDependencyFailureSimulation);
      let stateB = createInitialState(partialRegionalDependencyFailureSimulation);
      const eventsA: unknown[] = [];
      const eventsB: unknown[] = [];
      const tickMs = partialRegionalDependencyFailureSimulation.tickMs;

      for (let t = 0; t < REGIONAL_DIVERGENCE_MS + 5_000; t += tickMs) {
        const resultA = simulate(partialRegionalDependencyFailureSimulation, stateA, null, tickMs);
        stateA = resultA.state;
        eventsA.push(...resultA.events);

        const resultB = simulate(partialRegionalDependencyFailureSimulation, stateB, null, tickMs);
        stateB = resultB.state;
        eventsB.push(...resultB.events);
      }

      expect(eventsA).toEqual(eventsB);
    });
  });

  describe("Scoring", () => {
    it("scores good (regional), acceptable (global breaker), baseline, harmful, and immediate-finish paths with coherent ordering", () => {
      const goodState = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, REGIONAL_MITIGATION_ACTIONS);
      const goodFinish = evaluateCandidateDeclaredFinish(
        partialRegionalDependencyFailureSimulation,
        goodState,
      );
      const goodScore = scoreAuthoredAttempt(
        PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
        extractFinishScoringInputs(partialRegionalDependencyFailureSimulation, goodFinish),
      );

      const acceptableState = runScenario(REGIONAL_DIVERGENCE_MS + 32_000, GLOBAL_BREAKER_ACTIONS);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        partialRegionalDependencyFailureSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
        extractFinishScoringInputs(partialRegionalDependencyFailureSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(REGIONAL_DIVERGENCE_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
        extractScoringInputs(partialRegionalDependencyFailureSimulation, baselineState),
      );

      const harmfulState = runScenario(REGIONAL_DIVERGENCE_MS + 61_000, [
        { atMs: REGIONAL_DIVERGENCE_MS + 1_000, controlKey: GLOBAL_CIRCUIT_BREAKER_KEY, value: true },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
        extractScoringInputs(partialRegionalDependencyFailureSimulation, harmfulState),
      );

      // Immediate zero-action Finish at the very start: never resolved,
      // scored as an unresolved attempt (0 recovery/reliability via
      // terminalOverrides, no revenue loss yet, no cost increase, no
      // harmful/config changes).
      const immediateState = runScenario(1_000);
      const immediateScore = scoreAuthoredAttempt(
        PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
        extractScoringInputs(partialRegionalDependencyFailureSimulation, immediateState),
      );

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThan(harmfulScore.total);
      // The immediate zero-action Finish must never outscore a genuine
      // mitigation — per section 17's "flag immediate no-action Finish
      // unusually high" instruction.
      expect(immediateScore.total).toBeLessThan(goodScore.total);
      expect(immediateScore.total).toBeLessThan(acceptableScore.total);

      // Record and assert the actual executed totals (never assumed —
      // these are the real numbers scoreAuthoredAttempt returned).
      //
      // NOTE (section 16/17 suspicious-value investigation): baselineScore
      // and immediateScore legitimately tie at 550 here. Both are
      // never-resolved attempts (recovery/reliability score 0 via the
      // unresolved terminalOverrides) scored at a point where too little
      // time has passed for revenueLossUsd or costIncreaseRatio to have
      // diverged between a 20s-old unmitigated incident and a 1s-old
      // pre-incident state — both still fall in each dimension's top
      // band. This is NOT "immediate Finish scoring unusually high": 550
      // sits well below both the acceptable (800) and optimal (865)
      // paths, and dataIntegrity's 200 for both is correct per this
      // scenario's measure (mitigationApproach never equals "global" in
      // either case, so neither is penalized) — not a reward for
      // inaction. harmfulScore (485) is correctly the lowest of all five,
      // reflecting the global-breaker-without-fallback path's outright
      // failure (status: "failed").
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(800);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(485);
      expect(immediateScore.total).toBe(550);
    });
  });
});
