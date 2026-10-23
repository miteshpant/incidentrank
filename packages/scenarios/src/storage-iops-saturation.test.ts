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
import { storageIopsSaturation } from "./storage-iops-saturation";
import {
  BACKGROUND_WORKLOAD_PAUSED_KEY,
  BATCH_CONCURRENCY_KEY,
  CHECKPOINT_FREQUENCY_SECONDS_KEY,
  QUERY_CONCURRENCY_LIMIT_KEY,
  READ_CACHE_ENABLED_KEY,
  storageIopsSaturationSimulation,
  STORAGE_TIER_KEY,
} from "./storage-iops-saturation/definition";
import { storageIopsSaturationCandidateUI } from "./storage-iops-saturation/candidate-ui";
import { STORAGE_IOPS_SATURATION_SCORING } from "./storage-iops-saturation/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(storageIopsSaturationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += storageIopsSaturationSimulation.tickMs
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
      storageIopsSaturationSimulation,
      state,
      action,
      storageIopsSaturationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const BATCH_RAMPING_MS = 30_000;

describe("Storage IOPS Saturation", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(storageIopsSaturation.isFree).toBe(false);
      expect(storageIopsSaturation.library?.category).toBe("Databases & Storage");
      expect(storageIopsSaturation.library?.tags.length).toBeGreaterThan(0);
      expect(storageIopsSaturation.library?.skills.length).toBeGreaterThan(0);
      expect(storageIopsSaturation.difficulty).toBe("senior");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = STORAGE_IOPS_SATURATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = STORAGE_IOPS_SATURATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(storageIopsSaturationCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(storageIopsSaturationCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(storageIopsSaturationCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(storageIopsSaturationCandidateUI.components.length).toBe(3);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(storageIopsSaturationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.storageIopsUtilization).toBe(22);
      expect(state.values.storageRecoveryMode).toBe("unresolved");
    });

    it("the background compaction job ramping triggers the baseline incident", () => {
      const state = runScenario(BATCH_RAMPING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(BATCH_RAMPING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.storageIopsUtilization).toBe(88);
      expect(state.values.storageStatus).toBe("critical");
    });

    it("strong path: upgrading the storage tier resolves saturation and keeps batch throughput at full rate", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
      ]);
      expect(state.values.storageIopsUtilization).toBe(35);
      expect(state.values.storageStatus).toBe("normal");
      expect(state.values.storageRecoveryMode).toBe("tier-upgraded");
      expect(state.values.batchThroughputRowsPerSec).toBe(12_000);
      expect(state.values.batchBacklogMinutes).toBe(0);
    });

    it("pressure-transfer path: pausing the background workload clears customer-facing metrics but drives batch throughput to zero and backlog upward over time", () => {
      const justPaused = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      // Primary symptom relieved immediately.
      expect(justPaused.values.storageIopsUtilization).toBe(24);
      expect(justPaused.values.storageStatus).toBe("normal");
      expect(justPaused.values.apiLatencyMs).toBe(46);
      // Secondary subsystem (the batch job itself) visibly constrained
      // as a direct consequence of the same action.
      expect(justPaused.values.batchThroughputRowsPerSec).toBe(0);
      expect(justPaused.values.batchBacklogMinutes).toBeGreaterThan(0);
      expect(justPaused.values.storageRecoveryMode).toBe("workload-paused");

      // Backlog keeps rising the longer the pause continues — a
      // continuously observable, worsening consequence of the same
      // mitigation, not a one-time cost.
      const pausedLonger = runScenario(BATCH_RAMPING_MS + 6 * 60_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      expect(pausedLonger.values.batchBacklogMinutes).toBeGreaterThan(
        justPaused.values.batchBacklogMinutes as number,
      );
      // Customer-facing health remains intact throughout — this is a
      // genuine tradeoff (customer latency vs. batch completion time),
      // not a path that degrades the customer further over time.
      expect(pausedLonger.values.storageStatus).toBe("normal");
    });

    it("bounded alternate: reducing batch concurrency instead of a full pause gives real relief while keeping some batch throughput", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BATCH_CONCURRENCY_KEY, value: 1 },
      ]);
      expect(state.values.batchThroughputRowsPerSec).toBe(1_500);
      expect(state.values.batchThroughputRowsPerSec).toBeGreaterThan(0);
      expect(state.values.storageRecoveryMode).toBe("workload-throttled");
      // Real relief versus the unmitigated baseline, but not a full
      // recovery — this never crosses the success/acceptable bar.
      const baseline = runScenario(BATCH_RAMPING_MS + 20_000);
      expect(state.values.storageIopsUtilization).toBeLessThan(
        baseline.values.storageIopsUtilization as number,
      );
      expect(state.values.storageIopsUtilization).toBeGreaterThan(40);
    });

    it("harmful path: lowering query concurrency limit makes API latency worse than the unmitigated baseline", () => {
      const baseline = runScenario(BATCH_RAMPING_MS + 20_000);
      const throttled = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: QUERY_CONCURRENCY_LIMIT_KEY, value: 50 },
      ]);

      expect(throttled.values.apiLatencyMs).toBeGreaterThan(baseline.values.apiLatencyMs as number);
      expect(throttled.values.storageStatus).toBe("critical");
    });

    it("partial path: extending the checkpoint interval gives relief but trades the crash-recovery window and never fully recovers", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: CHECKPOINT_FREQUENCY_SECONDS_KEY, value: 300 },
      ]);
      expect(state.values.checkpointSafety).toBe("extended");
      expect(state.values.storageStatus).toBe("warning");
      expect(state.values.storageIopsUtilization).toBeGreaterThan(40);
    });

    it("partial path: enabling the read cache helps reads only and does not resolve write-driven saturation", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: READ_CACHE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.storageStatus).toBe("warning");
      expect(state.values.storageIopsUtilization).toBeGreaterThan(40);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(BATCH_RAMPING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.storageStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated compaction I/O saturates storage outright on a second wave, with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(BATCH_RAMPING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.storageIopsUtilization).toBeGreaterThanOrEqual(85);
      expect(beforeSecondWave.values.checkpointQueueDepth).toBeGreaterThan(0);

      const afterSecondWave = runScenario(BATCH_RAMPING_MS + 3 * 60_000 + 5_000);
      expect(afterSecondWave.values.storageIopsUtilization).toBe(97);
      expect(afterSecondWave.values.checkpointQueueDepth).toBe(18);
    });

    it("fails if storage IOPS utilization stays at or above 95% for the full sustained window", () => {
      const state = runScenario(BATCH_RAMPING_MS + 3 * 60_000 + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak IOPS utilization and peak batch backlog generically via numericWatchFields", () => {
      const state = runScenario(BATCH_RAMPING_MS + 1_000);
      expect(state.peaks.peakValues.storageIopsUtilization).toBe(88);

      const pausedLong = runScenario(BATCH_RAMPING_MS + 6 * 60_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      expect(pausedLong.peaks.peakValues.batchBacklogMinutes).toBeGreaterThan(0);
    });

    it("tracks monthly infrastructure cost that increases with the storage tier upgrade", () => {
      let state = createInitialState(storageIopsSaturationSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(1_800);

      const tickMs = storageIopsSaturationSimulation.tickMs;
      state = simulate(
        storageIopsSaturationSimulation,
        state,
        { id: "upgrade-tier", timestampMs: 0, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(1_800 + 650);
    });
  });

  describe("Phase 6.1: two-tier completion — tier-upgraded (optimal) vs workload-paused (acceptable)", () => {
    it("tier upgraded, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(storageIopsSaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("workload paused, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(storageIopsSaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("reduced batch concurrency alone remains ineligible for any Finish tier", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BATCH_CONCURRENCY_KEY, value: 1 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(storageIopsSaturationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        storageIopsSaturationSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        storageIopsSaturationSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
      ]);
      const result = evaluateCandidateDeclaredFinish(storageIopsSaturationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(storageIopsSaturationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(BATCH_RAMPING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(storageIopsSaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(BATCH_RAMPING_MS + 3 * 60_000 + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(storageIopsSaturationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ];
      const runA = runScenario(BATCH_RAMPING_MS + 6 * 60_000, actions);
      const runB = runScenario(BATCH_RAMPING_MS + 6 * 60_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical events for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
      ];
      let stateA = createInitialState(storageIopsSaturationSimulation);
      let stateB = createInitialState(storageIopsSaturationSimulation);
      const eventsA: unknown[] = [];
      const eventsB: unknown[] = [];
      const untilMs = BATCH_RAMPING_MS + 20_000;
      let actionIndex = 0;
      let counter = 0;
      for (let t = 0; t < untilMs; t += storageIopsSaturationSimulation.tickMs) {
        let action: CandidateAction | null = null;
        if (actionIndex < actions.length && actions[actionIndex]!.atMs <= t) {
          const pending = actions[actionIndex]!;
          counter += 1;
          action = { id: `a-${counter}`, timestampMs: t, controlKey: pending.controlKey, value: pending.value };
          actionIndex += 1;
        }
        const resA = simulate(storageIopsSaturationSimulation, stateA, action, storageIopsSaturationSimulation.tickMs);
        stateA = resA.state;
        eventsA.push(...resA.events);
      }
      actionIndex = 0;
      counter = 0;
      for (let t = 0; t < untilMs; t += storageIopsSaturationSimulation.tickMs) {
        let action: CandidateAction | null = null;
        if (actionIndex < actions.length && actions[actionIndex]!.atMs <= t) {
          const pending = actions[actionIndex]!;
          counter += 1;
          action = { id: `a-${counter}`, timestampMs: t, controlKey: pending.controlKey, value: pending.value };
          actionIndex += 1;
        }
        const resB = simulate(storageIopsSaturationSimulation, stateB, action, storageIopsSaturationSimulation.tickMs);
        stateB = resB.state;
        eventsB.push(...resB.events);
      }
      expect(eventsA).toEqual(eventsB);
      expect(stateA).toEqual(stateB);
    });
  });

  describe("Scoring", () => {
    it("scores good (tier-upgraded), acceptable (workload-paused), baseline, and harmful (query throttle) paths and records actual numbers", () => {
      const goodState = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: STORAGE_TIER_KEY, value: "provisioned-iops" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(storageIopsSaturationSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        STORAGE_IOPS_SATURATION_SCORING,
        extractFinishScoringInputs(storageIopsSaturationSimulation, goodFinish),
      );

      const acceptableState = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BACKGROUND_WORKLOAD_PAUSED_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        storageIopsSaturationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        STORAGE_IOPS_SATURATION_SCORING,
        extractFinishScoringInputs(storageIopsSaturationSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(BATCH_RAMPING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        STORAGE_IOPS_SATURATION_SCORING,
        extractScoringInputs(storageIopsSaturationSimulation, baselineState),
      );

      const harmfulState = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: QUERY_CONCURRENCY_LIMIT_KEY, value: 50 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        STORAGE_IOPS_SATURATION_SCORING,
        extractScoringInputs(storageIopsSaturationSimulation, harmfulState),
      );

      // Partial path: reduced batch concurrency never reaches Finish
      // eligibility either (ineligible per the completion-mode audit).
      const partialState = runScenario(BATCH_RAMPING_MS + 20_000, [
        { atMs: BATCH_RAMPING_MS + 1_000, controlKey: BATCH_CONCURRENCY_KEY, value: 1 },
      ]);
      const partialScore = scoreAuthoredAttempt(
        STORAGE_IOPS_SATURATION_SCORING,
        extractScoringInputs(storageIopsSaturationSimulation, partialState),
      );

      // Executed, actual numbers (asserted exactly, not merely ordered —
      // obtained by actually running scoreAuthoredAttempt and reading
      // the real result, per phase6b.md section 16).
      expect(goodScore.total).toBe(845);
      expect(goodScore.breakdown).toEqual({
        recovery: 300,
        customerImpact: 200,
        dataIntegrity: 200,
        reliability: 15,
        costEfficiency: 80,
        operationalEfficiency: 50,
      });

      expect(acceptableScore.total).toBe(825);
      expect(acceptableScore.breakdown).toEqual({
        recovery: 300,
        customerImpact: 200,
        dataIntegrity: 160,
        reliability: 15,
        costEfficiency: 100,
        operationalEfficiency: 50,
      });

      expect(baselineScore.total).toBe(550);
      expect(baselineScore.breakdown).toEqual({
        recovery: 0,
        customerImpact: 200,
        dataIntegrity: 200,
        reliability: 0,
        costEfficiency: 100,
        operationalEfficiency: 50,
      });

      expect(harmfulScore.total).toBe(535);
      expect(harmfulScore.breakdown.operationalEfficiency).toBe(35);

      expect(partialScore.total).toBe(550);

      // dataIntegrity-adjacent measure correctly discriminates optimal
      // (capacity genuinely fixed) from acceptable (workload merely
      // suppressed) even though recovery/customerImpact/reliability tie
      // between them in this fastest-possible-mitigation scenario — the
      // same section 16/17 pattern already documented and accepted for
      // Missing Database Index and Kafka Partition Skew.
      expect(goodScore.breakdown.recovery).toBe(acceptableScore.breakdown.recovery);
      expect(goodScore.breakdown.customerImpact).toBe(acceptableScore.breakdown.customerImpact);
      expect(goodScore.breakdown.reliability).toBe(acceptableScore.breakdown.reliability);
      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);

      // Unresolved paths (baseline/harmful/partial) all share the exact
      // same terminal-override zeroing on recovery/reliability, and
      // customerImpact/dataIntegrity/costEfficiency happen to band
      // identically across all three at this exact elapsed time (the
      // query-throttle action only changes apiLatencyMs/storage
      // numbers, which none of those three dimensions measure) — a
      // legitimate tie, documented per section 17 rather than hidden.
      // harmful correctly scores strictly lower than baseline/partial:
      // its one harmful-classified action (lowering query concurrency
      // limit) crosses operationalEfficiency's first harmfulChangeCount
      // penalty tier (50 -> 35), the one dimension that does
      // discriminate it.
      const withoutOperationalEfficiency = (
        breakdown: typeof harmfulScore.breakdown,
      ) => {
        const { operationalEfficiency, ...rest } = breakdown;
        void operationalEfficiency;
        return rest;
      };
      expect(withoutOperationalEfficiency(harmfulScore.breakdown)).toEqual(
        withoutOperationalEfficiency(baselineScore.breakdown),
      );
      expect(partialScore.breakdown).toEqual(baselineScore.breakdown);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      // Resolved paths clearly outscore any unresolved path.
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(goodScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
