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
import { hotDatabasePartition } from "./hot-database-partition";
import {
  API_INSTANCE_COUNT_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  hotDatabasePartitionSimulation,
  PARTITIONING_STRATEGY_KEY,
  ROUTING_POLICY_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  TENANT_THROTTLE_KEY,
} from "./hot-database-partition/definition";
import { hotDatabasePartitionCandidateUI } from "./hot-database-partition/candidate-ui";
import { HOT_DATABASE_PARTITION_SCORING } from "./hot-database-partition/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(hotDatabasePartitionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += hotDatabasePartitionSimulation.tickMs
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
      hotDatabasePartitionSimulation,
      state,
      action,
      hotDatabasePartitionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const CONCENTRATION_RISING_MS = 30_000;
const SATURATION_MS = CONCENTRATION_RISING_MS + 3 * 60_000;

describe("Hot Database Partition", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(hotDatabasePartition.isFree).toBe(false);
      expect(hotDatabasePartition.library?.category).toBe("Databases & Storage");
      expect(hotDatabasePartition.library?.tags.length).toBeGreaterThan(0);
      expect(hotDatabasePartition.library?.skills.length).toBeGreaterThan(0);
      expect(hotDatabasePartition.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = HOT_DATABASE_PARTITION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = HOT_DATABASE_PARTITION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(hotDatabasePartitionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(hotDatabasePartitionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(hotDatabasePartitionCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(hotDatabasePartitionCandidateUI.components.length).toBe(6);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(hotDatabasePartitionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.partitionARequestRate).toBe(400);
      expect(state.values.partitionRebalanceMode).toBe("unresolved");
    });

    it("tenant concentration rising triggers the baseline incident with per-partition asymmetry", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(CONCENTRATION_RISING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.partitionARequestRate).toBe(2_600);
      // Partitions B/C/D stay near baseline — the asymmetry is the
      // observable evidence a candidate needs.
      expect(state.values.partitionBRequestRate).toBe(385);
      expect(state.values.partitionCRequestRate).toBe(392);
      expect(state.values.partitionDRequestRate).toBe(372);
      expect(state.values.partitionAStatus).toBe("critical");
    });

    it("strong path: salted-hash re-keying resolves the skew for every tenant", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" },
      ]);
      expect(state.values.partitionAStatus).toBe("normal");
      expect(state.values.partitionAQueueDepth).toBe(0);
      expect(state.values.partitionRebalanceMode).toBe("rebalanced");
      expect(state.values.hotTenantTrafficSharePct).toBeLessThan(20);
    });

    it("alternate good path: round-robin keying clears symptoms but sacrifices tenant locality", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      expect(state.values.partitionAStatus).toBe("normal");
      expect(state.values.partitionRebalanceMode).toBe("round-robin");
    });

    it("acceptable tradeoff path: strict hot-tenant throttling protects the platform at the throttled tenants' expense", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "strict" },
      ]);
      expect(state.values.partitionAStatus).toBe("normal");
      expect(state.values.partitionRebalanceMode).toBe("hot-tenant-constrained");
      expect(state.values.throttledRequestRatePerSec).toBeGreaterThan(0);
    });

    it("harmful path: broad API scaling makes Partition A worse while B/C/D stay idle", () => {
      const baseline = runScenario(CONCENTRATION_RISING_MS + 20_000);
      const scaled = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);

      expect(scaled.values.partitionARequestRate).toBeGreaterThan(
        baseline.values.partitionARequestRate as number,
      );
      expect(scaled.values.partitionAQueueDepth).toBeGreaterThan(
        baseline.values.partitionAQueueDepth as number,
      );
      expect(scaled.values.partitionAStatus).toBe("critical");
      // B/C/D are unaffected by the scaling — proof the bottleneck was
      // never capacity.
      expect(scaled.values.partitionBRequestRate).toBe(390);
      expect(scaled.values.partitionCRequestRate).toBe(395);
      expect(scaled.values.partitionDRequestRate).toBe(375);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.partitionAStatus).toBe("critical");
    });

    it("pressure-transfer: shard split alone relieves Partition A but visibly constrains Partition B", () => {
      const before = runScenario(CONCENTRATION_RISING_MS + 20_000);
      expect(before.values.partitionBLatencyMs).toBe(24);
      expect(before.values.partitionBQueueDepth).toBe(0);

      const afterSplit = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
      ]);

      // Primary symptom relieved.
      expect(afterSplit.values.partitionAStatus).toBe("normal");
      expect(afterSplit.values.partitionAQueueDepth).toBe(0);
      // Secondary subsystem visibly constrained as the direct consequence.
      expect(afterSplit.values.partitionBLatencyMs).toBeGreaterThan(
        before.values.partitionBLatencyMs as number,
      );
      expect(afterSplit.values.partitionBQueueDepth).toBeGreaterThan(0);
      expect(afterSplit.values.partitionRebalanceMode).toBe("split-pending");
    });

    it("pressure-transfer resolved: pairing the shard split with least-loaded routing keeps Partition B healthy too", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
        { atMs: CONCENTRATION_RISING_MS + 2_000, controlKey: ROUTING_POLICY_KEY, value: "leastLoaded" },
      ]);
      expect(state.values.partitionAStatus).toBe("normal");
      expect(state.values.partitionBLatencyMs).toBeLessThanOrEqual(60);
      expect(state.values.partitionBQueueDepth).toBe(0);
      expect(state.values.partitionRebalanceMode).toBe("split-balanced");
    });

    it("partial path: hot-tenant cache alone gives relief but stays degraded (cold-cache / cache-miss writes still hit A)", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: HOT_TENANT_CACHE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.partitionAStatus).toBe("warning");
      expect(state.values.partitionRebalanceMode).toBe("unresolved");
    });

    it("partial path: moderate throttle alone gives relief but stays degraded", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "moderate" },
      ]);
      expect(state.values.partitionAStatus).toBe("warning");
      expect(state.values.partitionRebalanceMode).toBe("unresolved");
    });

    it("delayed consequence: sustained unmitigated concentration saturates Partition A on a second wave, with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(CONCENTRATION_RISING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.partitionAQueueDepth).toBeGreaterThan(0);
      expect(beforeSecondWave.values.partitionARequestRate).toBeGreaterThan(1_000);

      const afterSecondWave = runScenario(SATURATION_MS + 5_000);
      expect(afterSecondWave.values.partitionAStatus).toBe("critical");
      expect(afterSecondWave.values.partitionAQueueDepth).toBe(1_400);
    });

    it("stays active (never auto-fails) even after Partition A's queue depth remains at or above 1200 past the old sustained window", () => {
      const state = runScenario(SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        hotDatabasePartitionSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak Partition A request rate and peak Partition B latency generically via numericWatchFields", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
      ]);
      expect(state.peaks.peakValues.partitionARequestRate).toBeGreaterThan(0);
      expect(state.peaks.peakValues.partitionBLatencyMs).toBe(410);
    });

    it("tracks monthly infrastructure cost that increases with API instance count", () => {
      let state = createInitialState(hotDatabasePartitionSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(600);

      const tickMs = hotDatabasePartitionSimulation.tickMs;
      state = simulate(
        hotDatabasePartitionSimulation,
        state,
        { id: "scale-api", timestampMs: 0, controlKey: API_INSTANCE_COUNT_KEY, value: 32 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(600 + 1_300);
    });
  });

  describe("Phase 6.1: three-tier completion — rebalanced/split-balanced (optimal) vs round-robin/hot-tenant-constrained (acceptable)", () => {
    it("salted-hash rebalance, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotDatabasePartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("shard split + least-loaded routing, sustained, is also eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
        { atMs: CONCENTRATION_RISING_MS + 2_000, controlKey: ROUTING_POLICY_KEY, value: "leastLoaded" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotDatabasePartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("strict hot-tenant throttle, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "strict" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotDatabasePartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("round-robin keying, sustained, is also eligible for an ACCEPTABLE-tier Finish", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotDatabasePartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("shard split alone (pressure transferred to Partition B) remains ineligible for any Finish tier", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotDatabasePartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("moderate throttle alone remains ineligible for any Finish tier", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "moderate" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(hotDatabasePartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        hotDatabasePartitionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "strict" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        hotDatabasePartitionSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" },
      ]);
      const result = evaluateCandidateDeclaredFinish(hotDatabasePartitionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "strict" },
      ]);
      const result = evaluateCandidateDeclaredFinish(hotDatabasePartitionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(hotDatabasePartitionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from unsafe pressure-transferred state (split alone) -> declared_unstable", () => {
      const state = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(hotDatabasePartitionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails even past the old sustained window, but candidate_declared Finish still reports declared_unstable", () => {
      const state = runScenario(SATURATION_MS + 61_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        hotDatabasePartitionSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(hotDatabasePartitionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" },
      ];
      const runA = runScenario(CONCENTRATION_RISING_MS + 20_000, actions);
      const runB = runScenario(CONCENTRATION_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state, events, and score for a pressure-transfer action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
        { atMs: CONCENTRATION_RISING_MS + 2_000, controlKey: ROUTING_POLICY_KEY, value: "leastLoaded" },
      ];
      const runA = runScenario(CONCENTRATION_RISING_MS + 20_000, actions);
      const runB = runScenario(CONCENTRATION_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);

      const scoreA = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractScoringInputs(hotDatabasePartitionSimulation, runA),
      );
      const scoreB = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractScoringInputs(hotDatabasePartitionSimulation, runB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores good (salted-hash), acceptable (strict throttle), alternate-acceptable (round-robin), baseline, and harmful (broad scaling) paths with coherent ordering", () => {
      const goodState = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "saltedHash" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(hotDatabasePartitionSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractFinishScoringInputs(hotDatabasePartitionSimulation, goodFinish),
      );

      const acceptableState = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: TENANT_THROTTLE_KEY, value: "strict" },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        hotDatabasePartitionSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractFinishScoringInputs(hotDatabasePartitionSimulation, acceptableFinish),
      );

      const roundRobinState = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: PARTITIONING_STRATEGY_KEY, value: "roundRobin" },
      ]);
      const roundRobinFinish = evaluateCandidateDeclaredFinish(
        hotDatabasePartitionSimulation,
        roundRobinState,
      );
      const roundRobinScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractFinishScoringInputs(hotDatabasePartitionSimulation, roundRobinFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(CONCENTRATION_RISING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractScoringInputs(hotDatabasePartitionSimulation, baselineState),
      );

      const harmfulState = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractScoringInputs(hotDatabasePartitionSimulation, harmfulState),
      );

      // Executed totals, read directly from the real scorer run above.
      //
      // NOTE (section 16/17 suspicious-tie investigation): goodScore and
      // roundRobinScore legitimately tie at 865. Both mitigations are
      // applied one tick after incident start in this test, so
      // recovery/customerImpact/reliability recover equally fast for
      // both. dataIntegrity awards full marks to BOTH, by design:
      // scoring.ts's finalStringEquals measure only penalizes
      // "hot-tenant-constrained" specifically (the one tradeoff that
      // sacrifices a NAMED tenant's own throughput), not round-robin's
      // locality tradeoff — round-robin genuinely clears every
      // customer-facing symptom with no asymmetric cost to any single
      // party, which is why it is scored as fully equivalent to the
      // structural salted-hash fix rather than as a lesser acceptable
      // tier. This is an intentional scoring design choice, not an
      // artifact to "fix."
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(815);
      expect(roundRobinScore.total).toBe(865);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(roundRobinScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });

    it("scores the pressure-transferred shard-split state as unresolved (never a disguised success)", () => {
      const splitOnlyState = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
      ]);
      const splitOnlyScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractScoringInputs(hotDatabasePartitionSimulation, splitOnlyState),
      );

      const splitBalancedState = runScenario(CONCENTRATION_RISING_MS + 20_000, [
        { atMs: CONCENTRATION_RISING_MS + 1_000, controlKey: SHARD_SPLIT_INITIATED_KEY, value: true },
        { atMs: CONCENTRATION_RISING_MS + 2_000, controlKey: ROUTING_POLICY_KEY, value: "leastLoaded" },
      ]);
      const splitBalancedFinish = evaluateCandidateDeclaredFinish(
        hotDatabasePartitionSimulation,
        splitBalancedState,
      );
      const splitBalancedScore = scoreAuthoredAttempt(
        HOT_DATABASE_PARTITION_SCORING,
        extractFinishScoringInputs(hotDatabasePartitionSimulation, splitBalancedFinish),
      );

      expect(splitOnlyScore.total).toBeLessThan(splitBalancedScore.total);
    });
  });
});
