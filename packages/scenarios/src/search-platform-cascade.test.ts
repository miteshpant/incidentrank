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
import { searchPlatformCascade } from "./search-platform-cascade";
import {
  API_CAPACITY_KEY,
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  PARTIAL_RESULT_MODE_KEY,
  QUERY_CONCURRENCY_KEY,
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
  searchPlatformCascadeSimulation,
} from "./search-platform-cascade/definition";
import { searchPlatformCascadeCandidateUI } from "./search-platform-cascade/candidate-ui";
import { SEARCH_PLATFORM_CASCADE_SCORING } from "./search-platform-cascade/scoring";
import { actionClassifications } from "./search-platform-cascade/action-classifications";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(searchPlatformCascadeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += searchPlatformCascadeSimulation.tickMs
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
      searchPlatformCascadeSimulation,
      state,
      action,
      searchPlatformCascadeSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const RANKING_DEGRADES_MS = 30_000;
const COORDINATOR_DRAIN_WINDOW_ELAPSED_MS = RANKING_DEGRADES_MS + 2 * 60_000;

// Shorthand action chain: exclude ranking, reduce feature-store usage,
// turn on partial-result mode WITH the bounded cache -- the
// degraded-quality-safe path.
const DEGRADED_QUALITY_SAFE_ACTIONS: TimedAction[] = [
  { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "excluded" },
  { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "off" },
  { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "on" },
  { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: CACHE_KEY, value: "on" },
];

describe("Search Platform Cascade", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(searchPlatformCascade.isFree).toBe(false);
      expect(searchPlatformCascade.library?.category).toBe("Distributed Systems");
      expect(searchPlatformCascade.library?.tags.length).toBeGreaterThan(0);
      expect(searchPlatformCascade.library?.skills.length).toBeGreaterThan(0);
      expect(searchPlatformCascade.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = SEARCH_PLATFORM_CASCADE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = SEARCH_PLATFORM_CASCADE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(searchPlatformCascadeCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(searchPlatformCascadeCandidateUI.controls.length).toBe(8);
      expect(searchPlatformCascadeCandidateUI.components.length).toBe(7);
    });

    it("the briefing explicitly states all four business invariants", () => {
      const d = searchPlatformCascade.description;
      expect(d).toMatch(/basic search results? (is|are) business-critical/i);
      expect(d).toMatch(/advanced ranking.*(re-ranking)?.*optional during an incident/i);
      expect(d).toMatch(/search correctness must never be sacrificed/i);
      expect(d).toMatch(/feature enrichment may be degraded/i);
    });

    it("feedback coverage: every action classification rule carries feedback", () => {
      expect(actionClassifications.length).toBeGreaterThan(0);
      for (const rule of actionClassifications) {
        expect(rule.feedback).toBeDefined();
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(searchPlatformCascadeSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.coordinatorPressureStatus).toBe("normal");
      expect(state.values.staleOrUnrelatedResultsServedCount).toBe(0);
    });

    it("Ranking degradation triggers the incident; default config (no mitigation) goes critical", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(RANKING_DEGRADES_MS);
      expect(state.status).toBe("critical");
      expect(state.values.coordinatorPressureStatus).toBe("critical");
      expect(state.values.indexClusterAConnections).toBeGreaterThan(100);
      expect(state.values.featureStoreQps).toBeGreaterThan(1_000);
    });

    it("strong path: excluding ranking + reducing feature store + partial-result mode with cache keeps basic search healthy", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      expect(state.values.basicSearchSuccessRatePercent).toBeGreaterThanOrEqual(99);
      expect(state.values.rankedResponsePercent).toBe(0);
      expect(state.values.staleOrUnrelatedResultsServedCount).toBe(0);
      expect(state.values.responsePathMode).toBe("degraded-quality-safe");
    });

    it("harmful path (pressure-transfer trap): scaling query concurrency and API capacity alone while ranking stays in the path WORSENS index/feature-store pressure vs. baseline", () => {
      const baselineState = runScenario(RANKING_DEGRADES_MS + 10_000);
      const scaledState = runScenario(RANKING_DEGRADES_MS + 10_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
      ]);

      // Real authored numbers, proving the pressure transfer:
      expect(baselineState.values.indexClusterAConnections).toBe(240);
      expect(scaledState.values.indexClusterAConnections).toBe(480);
      expect(baselineState.values.featureStoreQps).toBe(3_400);
      expect(scaledState.values.featureStoreQps).toBe(6_800);
      expect(baselineState.values.searchApiP99Ms).toBe(3_900);
      expect(scaledState.values.searchApiP99Ms).toBe(9_100);

      expect(scaledState.values.indexClusterAConnections).toBeGreaterThan(
        baselineState.values.indexClusterAConnections as number,
      );
      expect(scaledState.values.featureStoreQps).toBeGreaterThan(
        baselineState.values.featureStoreQps as number,
      );
      expect(scaledState.values.basicSearchSuccessRatePercent).toBeLessThan(
        baselineState.values.basicSearchSuccessRatePercent as number,
      );
    });

    it("index timeout is a real, distinct lever: neutral under safe concurrency, but strictly worse than the untightened pressure-transfer trap once concurrency/API capacity are also raised", () => {
      // Baseline pressure-transfer trap: ranking included, concurrency
      // and API capacity both raised, index timeout left at its
      // untouched default (3000ms).
      const untightenedTrap = runScenario(RANKING_DEGRADES_MS + 10_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
      ]);
      expect(untightenedTrap.values.responsePathMode).toBe("scale-the-symptom");

      // Same trap, but the candidate also tightened the index timeout
      // to 1200ms, expecting it to help (it never does -- the index
      // clusters were never the bottleneck).
      const tightenedTrap = runScenario(RANKING_DEGRADES_MS + 10_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: INDEX_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(tightenedTrap.values.responsePathMode).toBe("scale-the-symptom-index-clipped");

      // Real, distinct, measurable worsening -- not the same numbers
      // reused under a different label.
      expect(tightenedTrap.values.basicSearchSuccessRatePercent).toBeLessThan(
        untightenedTrap.values.basicSearchSuccessRatePercent as number,
      );
      expect(tightenedTrap.values.indexClusterAConnections).toBeLessThan(
        untightenedTrap.values.indexClusterAConnections as number,
      );
      expect(tightenedTrap.values.indexClusterBConnections).toBeLessThan(
        untightenedTrap.values.indexClusterBConnections as number,
      );
      // Index Cluster A/B's own serving latency never changes -- the
      // index clusters themselves are never actually slower.
      expect(tightenedTrap.values.indexClusterALatencyMs).toBe(
        untightenedTrap.values.indexClusterALatencyMs,
      );

      // Outside the pressure-transfer trap (safe concurrency/API
      // capacity), tightening the index timeout alone stays genuinely
      // neutral -- the baseline-unmitigated path, unaffected.
      const neutralAlone = runScenario(RANKING_DEGRADES_MS + 10_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: INDEX_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(neutralAlone.values.responsePathMode).toBe("full-ranking");
      expect(neutralAlone.values.indexClusterAConnections).toBe(240);
      expect(neutralAlone.values.basicSearchSuccessRatePercent).toBe(84);
    });

    it("historical damage: the unsafe partial-results-without-cache combination grows a correctness counter that looks healthy on availability alone", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 10_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "excluded" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "on" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: CACHE_KEY, value: "off" },
      ]);
      expect(state.values.basicSearchSuccessRatePercent).toBeGreaterThanOrEqual(99);
      expect(state.values.staleOrUnrelatedResultsServedCount).toBeGreaterThan(0);
      expect(state.values.responsePathMode).toBe("unsafe-partial-results");
    });

    it("historical damage does not reset once the cache is turned on -- the engine's peak tracker remembers the violation even though the live snapshot moves on", () => {
      const unsafeThenFixed = runScenario(RANKING_DEGRADES_MS + 20_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "excluded" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "on" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: CACHE_KEY, value: "off" },
        { atMs: RANKING_DEGRADES_MS + 10_000, controlKey: CACHE_KEY, value: "on" },
      ]);
      // Once the cache is engaged, the live matched-rule snapshot moves
      // to the safe degraded-quality state (its own authored
      // staleOrUnrelatedResultsServedCount is 0, since nothing is
      // growing NOW) -- but the engine's own peak tracker
      // (numericWatchFields trackPeak, state.peaks.peakValues) recorded
      // 340 while the unsafe combination was active and NEVER decreases
      // it, regardless of what the live snapshot shows afterward. This
      // is the real, engine-level, non-resettable historical record.
      expect(unsafeThenFixed.values.responsePathMode).not.toBe("unsafe-partial-results");
      expect(unsafeThenFixed.peaks.peakValues.staleOrUnrelatedResultsServedCount).toBe(340);

      // The scoring input surfaces the exact same non-reset peak.
      const scoringInputs = extractScoringInputs(searchPlatformCascadeSimulation, unsafeThenFixed);
      expect(scoringInputs.peakNumericValues.staleOrUnrelatedResultsServedCount).toBe(340);
    });
  });

  describe("Multi-step path", () => {
    it("requires more than one action to reach the fully safe, drained end-state", () => {
      const state = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 10_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      expect(state.values.responsePathMode).toBe("degraded-quality-safe");
      expect(state.values.indexClusterAConnections).toBeLessThanOrEqual(65);
      expect(state.values.coordinatorPressureStatus).toBe("normal");
    });
  });

  describe("Sequencing", () => {
    it("UNSAFE order: restoring ranking before the coordinator drain window elapses re-spikes pressure", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 10_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        // Restore ranking almost immediately -- well before the 2-minute
        // drain window has elapsed.
        { atMs: RANKING_DEGRADES_MS + 5_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
      ]);
      expect(state.values.responsePathMode).toBe("restored-too-early");
      expect(state.values.coordinatorPressureStatus).toBe("critical");
      expect(state.values.indexClusterAConnections).toBeGreaterThan(65);
    });

    it("SAFE order: restoring ranking AFTER the coordinator drain window elapses is safe", () => {
      const state = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 10_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
      ]);
      expect(state.values.responsePathMode).toBe("restored-safely");
      expect(state.values.coordinatorPressureStatus).toBe("normal");
      expect(state.values.indexClusterAConnections).toBeLessThanOrEqual(65);
    });

    it("the SAME final control value (ranking included) is unsafe before the drain window and safe after it -- proving this is a real sequencing effect, not a static configuration difference", () => {
      const tooEarly = runScenario(RANKING_DEGRADES_MS + 10_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: RANKING_DEGRADES_MS + 5_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
      ]);
      const afterDrain = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 10_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
      ]);
      expect(tooEarly.controlValues[RANKING_INCLUSION_KEY]).toBe("included");
      expect(afterDrain.controlValues[RANKING_INCLUSION_KEY]).toBe("included");
      expect(tooEarly.values.coordinatorPressureStatus).toBe("critical");
      expect(afterDrain.values.coordinatorPressureStatus).toBe("normal");
    });
  });

  describe("Completion", () => {
    it("the degraded-quality safe (draining) state is eligible at the acceptable tier", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      const eligibility = evaluateCompletionEligibility(searchPlatformCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("the fully drained degraded-quality state (ranking permanently excluded) is eligible at the optimal tier", () => {
      const state = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      const eligibility = evaluateCompletionEligibility(searchPlatformCascadeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the fully restored, drained end-state (ranking back, capacity safe) is eligible at the optimal tier", () => {
      const state = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
      ]);
      const result = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("the unsafe partial-results-without-cache state is never Finish-eligible, however healthy availability looks", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 40_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "excluded" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "on" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: CACHE_KEY, value: "off" },
      ]);
      expect(state.values.basicSearchSuccessRatePercent).toBeGreaterThanOrEqual(99);
      const eligibility = evaluateCompletionEligibility(searchPlatformCascadeSimulation, state);
      expect(eligibility.eligible).toBe(false);
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 40_000);
      const result = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("stays active (never auto-fails) even after basic search success rate has been sustained below the failure floor past the old sustained window; candidate_declared mode still applies", () => {
      const state = runScenario(RANKING_DEGRADES_MS + 110_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(90);
      const result = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    describe("Immediate-Finish audit", () => {
      it("a zero-action Finish issued the instant Ranking degrades does NOT resolve (default config leaves the coordinator critical immediately)", () => {
        const state = runScenario(RANKING_DEGRADES_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("a zero-action Finish issued before Ranking degrades is moot: no incident has started yet", () => {
        const state = runScenario(RANKING_DEGRADES_MS - 5_000);
        expect(state.incidentStartedAtMs).toBeNull();
        const result = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("even the correct fix requires the full 30s sustained window before Finish is eligible", () => {
        const justFixed = runScenario(RANKING_DEGRADES_MS + 10_000, DEGRADED_QUALITY_SAFE_ACTIONS);
        expect(justFixed.values.coordinatorPressureStatus).not.toBe("critical");
        const eligibility = evaluateCompletionEligibility(searchPlatformCascadeSimulation, justFixed);
        expect(eligibility.eligible).toBe(false);
        expect(justFixed.transitions.consecutiveAcceptableSeconds).toBeLessThan(30);
      });
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(RANKING_DEGRADES_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      const runB = runScenario(RANKING_DEGRADES_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal, acceptable, baseline, and harmful with coherent ordering -- executed totals", () => {
      // Optimal: fully restored after the drain window.
      const optimalState = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
      ]);
      const optimalFinish = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractFinishScoringInputs(searchPlatformCascadeSimulation, optimalFinish),
      );

      // Acceptable: degraded-quality-safe, still draining. Run well
      // past the acceptable condition's own 30s sustain window so the
      // derived scoring timestamp reflects a believable elapsed
      // recovery duration, not an artifact of a too-short test window.
      const acceptableState = runScenario(RANKING_DEGRADES_MS + 90_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      const acceptableFinish = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractFinishScoringInputs(searchPlatformCascadeSimulation, acceptableFinish),
      );

      // Baseline: never acted, never Finish-eligible. Held for the same
      // duration as the harmful run below so "did nothing" and "made it
      // worse" are measured over a comparable, honest window.
      const baselineState = runScenario(RANKING_DEGRADES_MS + 85_000);
      const baselineScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, baselineState),
      );

      // Harmful: scale-the-symptom trap, held long enough to accrue real
      // revenue loss (never Finish-eligible).
      const harmfulState = runScenario(RANKING_DEGRADES_MS + 85_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, harmfulState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(optimalScore.total).toBe(945);
      expect(acceptableScore.total).toBe(865);
      expect(baselineScore.total).toBe(450);
      expect(harmfulScore.total).toBe(275);

      // Sanity checks against the mandatory failure modes
      // (phase6d.2.md section 12):
      // (1) harmful must not score anywhere close to optimal.
      expect(harmfulScore.total).toBeLessThan(optimalScore.total * 0.5);
      // (2) no-action baseline must not score highly.
      expect(baselineScore.total).toBeLessThan(500);
      // (3) acceptable must never exceed optimal.
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      // (4) availability-good/correctness-bad trap (unsafe partial
      // results, basic search reading 99.5% while correctness is
      // genuinely violated) must not score near optimal, and must score
      // materially worse on dataIntegrity specifically.
      const trapState = runScenario(RANKING_DEGRADES_MS + 85_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "excluded" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "on" },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: CACHE_KEY, value: "off" },
      ]);
      const trapScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, trapState),
      );
      expect(trapState.values.basicSearchSuccessRatePercent).toBeGreaterThanOrEqual(99);
      expect(trapScore.total).toBeLessThan(optimalScore.total * 0.7);
      expect(trapScore.breakdown.dataIntegrity).toBeLessThan(optimalScore.breakdown.dataIntegrity);
      expect(trapScore.breakdown.dataIntegrity).toBe(50);
    });

    it("alternate strong path: declaring Finish from the fully-drained degraded-quality state (ranking permanently excluded) scores dataIntegrity identically to the fully-restored path -- a candidate is not penalized for accepting a legitimate permanent degradation", () => {
      const degradedDrainedState = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      const degradedDrainedFinish = evaluateCandidateDeclaredFinish(
        searchPlatformCascadeSimulation,
        degradedDrainedState,
      );
      expect(degradedDrainedFinish.completionTier).toBe("optimal");
      const degradedDrainedScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractFinishScoringInputs(searchPlatformCascadeSimulation, degradedDrainedFinish),
      );

      const fullyRestoredState = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
      ]);
      const fullyRestoredFinish = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, fullyRestoredState);
      const fullyRestoredScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractFinishScoringInputs(searchPlatformCascadeSimulation, fullyRestoredFinish),
      );

      expect(degradedDrainedScore.breakdown.dataIntegrity).toBe(200);
      expect(fullyRestoredScore.breakdown.dataIntegrity).toBe(200);
    });

    it("the sequencing retrigger scores far below the safely-restored path", () => {
      const retriggeredState = runScenario(RANKING_DEGRADES_MS + 85_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: RANKING_DEGRADES_MS + 5_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
      ]);
      const retriggeredScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, retriggeredState),
      );

      const safelyRestoredState = runScenario(COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...DEGRADED_QUALITY_SAFE_ACTIONS,
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: RANKING_INCLUSION_KEY, value: "included" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FEATURE_STORE_USAGE_KEY, value: "full" },
        { atMs: COORDINATOR_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: PARTIAL_RESULT_MODE_KEY, value: "off" },
      ]);
      const safelyRestoredFinish = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, safelyRestoredState);
      const safelyRestoredScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractFinishScoringInputs(searchPlatformCascadeSimulation, safelyRestoredFinish),
      );

      expect(retriggeredScore.total).toBeLessThan(safelyRestoredScore.total);
    });

    it("the timeout-shortened-alone partial relief path scores worse than the acceptable degraded-quality-safe path despite having ranking partially active", () => {
      const partialReliefState = runScenario(RANKING_DEGRADES_MS + 40_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: RANKING_TIMEOUT_MS_KEY, value: 400 },
      ]);
      const partialReliefScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, partialReliefState),
      );

      const acceptableState = runScenario(RANKING_DEGRADES_MS + 40_000, DEGRADED_QUALITY_SAFE_ACTIONS);
      const acceptableFinish = evaluateCandidateDeclaredFinish(searchPlatformCascadeSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractFinishScoringInputs(searchPlatformCascadeSimulation, acceptableFinish),
      );

      expect(partialReliefScore.total).toBeLessThan(acceptableScore.total);
    });

    it("tightening the index timeout during the pressure-transfer trap scores worse than the untightened trap, held long enough to accrue real revenue loss", () => {
      const untightenedTrapState = runScenario(RANKING_DEGRADES_MS + 85_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
      ]);
      const untightenedTrapScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, untightenedTrapState),
      );

      const tightenedTrapState = runScenario(RANKING_DEGRADES_MS + 85_000, [
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: QUERY_CONCURRENCY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: API_CAPACITY_KEY, value: 400 },
        { atMs: RANKING_DEGRADES_MS + 1_000, controlKey: INDEX_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      const tightenedTrapScore = scoreAuthoredAttempt(
        SEARCH_PLATFORM_CASCADE_SCORING,
        extractScoringInputs(searchPlatformCascadeSimulation, tightenedTrapState),
      );

      expect(tightenedTrapState.values.responsePathMode).toBe("scale-the-symptom-index-clipped");
      expect(tightenedTrapScore.total).toBeLessThan(untightenedTrapScore.total);
      // Real, authored distinction: the tightened path accrues
      // materially more revenue loss (customerImpact) because it causes
      // genuine search failures, not merely held-open pressure --
      // verified against the real executed breakdowns, not assumed.
      expect(tightenedTrapScore.breakdown.customerImpact).toBeLessThan(
        untightenedTrapScore.breakdown.customerImpact,
      );
    });
  });
});
