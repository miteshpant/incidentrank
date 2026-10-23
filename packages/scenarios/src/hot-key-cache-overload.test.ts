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
import { hotKeyCacheOverload } from "./hot-key-cache-overload";
import {
  CACHE_CLUSTER_SIZE_KEY,
  CACHE_TTL_SECONDS_KEY,
  hotKeyCacheOverloadSimulation,
  KEY_REPLICATION_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
} from "./hot-key-cache-overload/definition";
import { hotKeyCacheOverloadCandidateUI } from "./hot-key-cache-overload/candidate-ui";
import { HOT_KEY_CACHE_OVERLOAD_SCORING } from "./hot-key-cache-overload/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(hotKeyCacheOverloadSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += hotKeyCacheOverloadSimulation.tickMs
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
      hotKeyCacheOverloadSimulation,
      state,
      action,
      hotKeyCacheOverloadSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const HOT_KEY_SPIKE_MS = 30_000;
const SHARD_EVICTION_CASCADE_MS = HOT_KEY_SPIKE_MS + 3 * 60_000;

describe("Hot-Key Cache Overload", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(hotKeyCacheOverload.isFree).toBe(false);
      expect(hotKeyCacheOverload.library?.category).toBe("Caching");
      expect(hotKeyCacheOverload.library?.tags.length).toBeGreaterThan(0);
      expect(hotKeyCacheOverload.library?.skills.length).toBeGreaterThan(0);
      expect(hotKeyCacheOverload.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions", () => {
      const dims = HOT_KEY_CACHE_OVERLOAD_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = HOT_KEY_CACHE_OVERLOAD_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(hotKeyCacheOverloadCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(hotKeyCacheOverloadCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(hotKeyCacheOverloadCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(hotKeyCacheOverloadSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.hotShardUtilizationPct).toBe(20);
      expect(state.values.hotKeyMitigationMode).toBe("unresolved");
    });

    it("the hot-key spike triggers the baseline incident", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(HOT_KEY_SPIKE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.hotShardUtilizationPct).toBe(92);
      expect(state.values.otherShardsUtilizationPct).toBe(20);
      expect(state.values.hotShardStatus).toBe("critical");
    });

    it("strong path: replicating the hot key resolves the shard regardless of other controls", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.hotShardUtilizationPct).toBe(24);
      expect(state.values.hotKeyMitigationMode).toBe("targeted");
      expect(state.values.hotShardStatus).toBe("normal");
    });

    it("alternate strong path: request coalescing resolves the shard and caps origin traffic", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.hotShardUtilizationPct).toBe(26);
      expect(state.values.originRequestRatePerSec).toBe(12);
      expect(state.values.hotKeyMitigationMode).toBe("targeted");
    });

    it("alternate strong path: local API-tier caching resolves the shard by bypassing it entirely", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: LOCAL_API_CACHE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.hotShardUtilizationPct).toBe(21);
      expect(state.values.hotKeyMitigationMode).toBe("targeted");
    });

    it("required property: scaling the cache cluster broadly does not relieve the hot shard", () => {
      const baseline = runScenario(HOT_KEY_SPIKE_MS + 20_000);
      const scaled = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: CACHE_CLUSTER_SIZE_KEY, value: 16 },
      ]);

      // The hot shard itself stays just as saturated — within a small
      // authored tolerance, not meaningfully relieved.
      expect(scaled.values.hotShardUtilizationPct as number).toBeGreaterThanOrEqual(
        (baseline.values.hotShardUtilizationPct as number) - 2,
      );
      expect(scaled.values.hotShardStatus).toBe("critical");
      expect(scaled.values.hotKeyMitigationMode).toBe("unresolved");
    });

    it("harmful path: shortening the TTL on an already-hot key increases churn and origin load", () => {
      const baseline = runScenario(HOT_KEY_SPIKE_MS + 20_000);
      const shortened = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 5 },
      ]);

      expect(shortened.values.hotShardUtilizationPct as number).toBeGreaterThan(
        baseline.values.hotShardUtilizationPct as number,
      );
      expect(shortened.values.originRequestRatePerSec as number).toBeGreaterThan(
        baseline.values.originRequestRatePerSec as number,
      );
      expect(shortened.values.hotShardStatus).toBe("critical");
    });

    it("real but incomplete: origin protection shields origin but leaves the hot shard saturated", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: ORIGIN_PROTECTION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.originRequestRatePerSec).toBe(90);
      expect(state.values.hotShardUtilizationPct).toBe(96);
      expect(state.values.hotShardStatus).toBe("critical");
      expect(state.values.hotKeyMitigationMode).toBe("origin-shielded");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.hotShardStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated spike triggers a shard eviction cascade on a second wave", () => {
      const beforeSecondWave = runScenario(HOT_KEY_SPIKE_MS + 60_000);
      // Observable precursor already visible before the cascade lands.
      expect(beforeSecondWave.values.hotShardUtilizationPct).toBeGreaterThanOrEqual(90);
      expect(beforeSecondWave.values.cacheHitRatePct as number).toBeLessThan(97);

      const afterSecondWave = runScenario(SHARD_EVICTION_CASCADE_MS + 5_000);
      expect(afterSecondWave.values.originRequestRatePerSec).toBe(3_400);
      expect(afterSecondWave.values.cacheHitRatePct).toBe(41);
    });

    it("acceptable path: round-robin sharding spreads the key but sacrifices per-key locality", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: SHARDING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      expect(state.values.hotShardUtilizationPct).toBe(28);
      expect(state.values.hotShardStatus).toBe("normal");
      expect(state.values.hotKeyMitigationMode).toBe("locality-sacrificed");
    });

    it("partial path: extending the TTL gives relief but stays degraded", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 90 },
      ]);
      expect(state.values.hotShardUtilizationPct).toBe(82);
      expect(state.values.hotShardStatus).toBe("warning");
      expect(state.values.hotKeyMitigationMode).toBe("unresolved");
    });

    it("fails if hot shard utilization stays at or above 95% for the full sustained window", () => {
      const state = runScenario(SHARD_EVICTION_CASCADE_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak hot-shard utilization and peak origin request rate generically via numericWatchFields", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 1_000);
      expect(state.peaks.peakValues.hotShardUtilizationPct).toBe(92);
      expect(state.peaks.peakValues.originRequestRatePerSec).toBe(650);
    });

    it("tracks monthly infrastructure cost that increases with cache cluster size", () => {
      let state = createInitialState(hotKeyCacheOverloadSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = hotKeyCacheOverloadSimulation.tickMs;
      state = simulate(
        hotKeyCacheOverloadSimulation,
        state,
        { id: "scale-cluster", timestampMs: 0, controlKey: CACHE_CLUSTER_SIZE_KEY, value: 16 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 700);
    });
  });

  describe("Phase 6.1: two-tier completion — targeted fix (optimal) vs round-robin spread (acceptable)", () => {
    it("replication, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotKeyCacheOverloadSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("round-robin sharding, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: SHARDING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotKeyCacheOverloadSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("origin protection alone remains ineligible for any Finish tier — availability-looking but not actually fixed", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: ORIGIN_PROTECTION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotKeyCacheOverloadSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        hotKeyCacheOverloadSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: SHARDING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        hotKeyCacheOverloadSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(hotKeyCacheOverloadSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: SHARDING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      const result = evaluateCandidateDeclaredFinish(hotKeyCacheOverloadSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(hotKeyCacheOverloadSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the 'availability looks healthy but shard is still critical' origin-shielded state -> declared_unstable", () => {
      const state = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: ORIGIN_PROTECTION_ENABLED_KEY, value: true },
      ]);
      // Origin traffic looks tame (90 rps) even though the real
      // bottleneck — the hot shard — is still fully saturated.
      expect(state.values.originRequestRatePerSec).toBe(90);
      expect(state.values.hotShardStatus).toBe("critical");
      const result = evaluateCandidateDeclaredFinish(hotKeyCacheOverloadSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(SHARD_EVICTION_CASCADE_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(hotKeyCacheOverloadSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(HOT_KEY_SPIKE_MS + 20_000, actions);
      const runB = runScenario(HOT_KEY_SPIKE_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (replicated), alternate good (coalesced), acceptable (round-robin), baseline, and harmful paths with coherent ordering", () => {
      const goodState = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: KEY_REPLICATION_ENABLED_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(hotKeyCacheOverloadSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        HOT_KEY_CACHE_OVERLOAD_SCORING,
        extractFinishScoringInputs(hotKeyCacheOverloadSimulation, goodFinish),
      );

      const alternateGoodState = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: REQUEST_COALESCING_ENABLED_KEY, value: true },
      ]);
      const alternateGoodFinish = evaluateCandidateDeclaredFinish(
        hotKeyCacheOverloadSimulation,
        alternateGoodState,
      );
      const alternateGoodScore = scoreAuthoredAttempt(
        HOT_KEY_CACHE_OVERLOAD_SCORING,
        extractFinishScoringInputs(hotKeyCacheOverloadSimulation, alternateGoodFinish),
      );

      const acceptableState = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: SHARDING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        hotKeyCacheOverloadSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        HOT_KEY_CACHE_OVERLOAD_SCORING,
        extractFinishScoringInputs(hotKeyCacheOverloadSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(HOT_KEY_SPIKE_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        HOT_KEY_CACHE_OVERLOAD_SCORING,
        extractScoringInputs(hotKeyCacheOverloadSimulation, baselineState),
      );

      const harmfulState = runScenario(HOT_KEY_SPIKE_MS + 20_000, [
        { atMs: HOT_KEY_SPIKE_MS + 1_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 5 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        HOT_KEY_CACHE_OVERLOAD_SCORING,
        extractScoringInputs(hotKeyCacheOverloadSimulation, harmfulState),
      );

      // NOTE (section 16/17 suspicious-tie investigation): recovery,
      // customerImpact, and reliability legitimately tie between
      // goodScore and alternateGoodScore (both are OPTIMAL-tier targeted
      // fixes applied equally fast), and also tie between goodScore and
      // acceptableScore for the same reason — all three mitigations are
      // applied one tick after incident start in this test, so all three
      // recover the customer-facing metrics equally fast. reliability's
      // floor-band for all three is a pre-existing, already-accepted
      // engine-wide artifact of criticalTimeRatio's tiny denominator on
      // a near-instant fix (also present in Missing Database Index's and
      // Hot Database Partition's own fastest-recovery paths) — not
      // something this scenario's scoring redesigns, per section 17's
      // binding instruction. dataIntegrity is the dimension that
      // correctly discriminates optimal from acceptable (see scoring.ts's
      // finalStringEquals measure on hotKeyMitigationMode), which is why
      // goodScore/alternateGoodScore and acceptableScore's totals differ.
      expect(goodScore.total).toBe(865);
      expect(alternateGoodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(815);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toEqual(alternateGoodScore.total);
      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
