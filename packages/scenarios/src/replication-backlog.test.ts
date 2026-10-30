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
import { replicationBacklog } from "./replication-backlog";
import {
  BATCHING_MODE_KEY,
  READ_ROUTING_KEY,
  REPLICA_COUNT_KEY,
  REPLICATION_WORKER_COUNT_KEY,
  replicationBacklogSimulation,
  TRAFFIC_PRIORITY_KEY,
  WRITE_THROTTLE_LEVEL_KEY,
} from "./replication-backlog/definition";
import { replicationBacklogCandidateUI } from "./replication-backlog/candidate-ui";
import { REPLICATION_BACKLOG_SCORING } from "./replication-backlog/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(replicationBacklogSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += replicationBacklogSimulation.tickMs
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
      replicationBacklogSimulation,
      state,
      action,
      replicationBacklogSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const WRITE_SURGE_MS = 30_000;
const STORAGE_PRESSURE_CRITICAL_MS = WRITE_SURGE_MS + 4 * 60_000;

describe("Replication Backlog", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(replicationBacklog.isFree).toBe(false);
      expect(replicationBacklog.library?.category).toBe("Distributed Systems");
      expect(replicationBacklog.library?.tags.length).toBeGreaterThan(0);
      expect(replicationBacklog.library?.skills.length).toBeGreaterThan(0);
      expect(replicationBacklog.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions summing to 1000", () => {
      const dims = REPLICATION_BACKLOG_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = REPLICATION_BACKLOG_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(replicationBacklogCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(replicationBacklogCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(replicationBacklogCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(replicationBacklogSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.replicationLagMs).toBe(400);
      expect(state.values.replicationHealth).toBe("throughput-matched");
    });

    it("write surge triggers the backlog-growing baseline incident", () => {
      const state = runScenario(WRITE_SURGE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(WRITE_SURGE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.replicationLagMs).toBe(18_000);
      expect(state.values.staleReadAgeMs).toBe(17_600);
      expect(state.values.primaryStatus).toBe("critical");
    });

    it("strong path (a): aggressive write throttling recovers replication at the cost of write acceptance", () => {
      const state = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
      ]);
      expect(state.values.replicationLagMs).toBe(180);
      expect(state.values.staleReadAgeMs).toBe(150);
      expect(state.values.primaryStatus).toBe("normal");
      expect(state.values.writeAcceptanceRate).toBe(55);
      expect(state.values.replicationHealth).toBe("throughput-matched");
    });

    it("strong path (c): parallelism + compressed batching recovers replication without sacrificing write acceptance", () => {
      const state = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: REPLICATION_WORKER_COUNT_KEY, value: 16 },
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "compressed-batch" },
      ]);
      expect(state.values.replicationLagMs).toBe(220);
      expect(state.values.staleReadAgeMs).toBe(190);
      expect(state.values.primaryStatus).toBe("normal");
      expect(state.values.writeAcceptanceRate).toBe(100);
      expect(state.values.replicationHealth).toBe("throughput-matched");
    });

    it("partial path: 8 workers + compressed batching helps a lot but plateaus below full recovery", () => {
      const state = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: REPLICATION_WORKER_COUNT_KEY, value: 8 },
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "compressed-batch" },
      ]);
      expect(state.values.replicationLagMs).toBe(6_500);
      expect(state.values.primaryStatus).toBe("warning");
      expect(state.values.replicationHealth).toBe("backlogged");

      const baseline = runScenario(WRITE_SURGE_MS + 20_000);
      expect(state.values.replicationLagMs).toBeLessThan(baseline.values.replicationLagMs as number);
    });

    it("tempting-but-unsafe path: routing fresh reads to the primary isolates staleness to zero while the backlog itself keeps growing", () => {
      const state = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: READ_ROUTING_KEY, value: "primary-for-fresh-reads" },
      ]);
      expect(state.values.staleReadAgeMs).toBe(0);
      expect(state.values.replicationLagMs).toBe(32_000);
      expect(state.values.replicationHealth).toBe("reads-isolated");
      expect(state.status).not.toBe("resolved");
    });

    it("harmful path: large uncompressed batches make lag worse than doing nothing", () => {
      const baseline = runScenario(WRITE_SURGE_MS + 20_000);
      const harmed = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "large-uncompressed-batch" },
      ]);
      expect(harmed.values.replicationLagMs).toBeGreaterThan(baseline.values.replicationLagMs as number);
      expect(harmed.values.networkPressure).toBeGreaterThan(baseline.values.networkPressure as number);
    });

    it("harmful path: adding replicas while backlogged worsens fan-out contention", () => {
      const baseline = runScenario(WRITE_SURGE_MS + 20_000);
      const harmed = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: REPLICA_COUNT_KEY, value: 3 },
      ]);
      expect(harmed.values.replicationLagMs).toBeGreaterThan(baseline.values.replicationLagMs as number);
      expect(harmed.values.networkPressure).toBeGreaterThan(baseline.values.networkPressure as number);
    });

    it("harmful path: routing all reads to the primary without throttling overloads the primary", () => {
      const state = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: READ_ROUTING_KEY, value: "primary-only" },
      ]);
      expect(state.values.primaryStatus).toBe("critical");
      expect(state.values.writeAcceptanceRate).toBeLessThan(100);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(WRITE_SURGE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.primaryStatus).toBe("critical");
    });

    it("partial relief: priority shedding of non-critical writes reduces but does not clear the backlog", () => {
      const baseline = runScenario(WRITE_SURGE_MS + 20_000);
      const shed = runScenario(WRITE_SURGE_MS + 20_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: TRAFFIC_PRIORITY_KEY, value: "prioritize-critical-writes" },
      ]);
      expect(shed.values.replicationLagMs).toBeLessThan(baseline.values.replicationLagMs as number);
      expect(shed.values.replicationLagMs).toBeGreaterThan(1_000);
    });

    it("delayed consequence: sustained unmitigated backlog exhausts staging storage on a second wave", () => {
      const beforeSecondWave = runScenario(WRITE_SURGE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.storagePressure).toBeGreaterThanOrEqual(55);
      expect(beforeSecondWave.values.replicationLagMs).toBeGreaterThan(10_000);

      const afterSecondWave = runScenario(STORAGE_PRESSURE_CRITICAL_MS + 5_000);
      expect(afterSecondWave.values.storagePressure).toBe(98);
      expect(afterSecondWave.values.replicationLagMs).toBe(95_000);
    });

    it("stays active (never auto-fails) even after storage pressure remains at or above 95% past the old sustained window", () => {
      const state = runScenario(STORAGE_PRESSURE_CRITICAL_MS + 46_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        replicationBacklogSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak replication lag and peak stale-read age generically via numericWatchFields", () => {
      const state = runScenario(WRITE_SURGE_MS + 1_000);
      expect(state.peaks.peakValues.replicationLagMs).toBe(18_000);
      expect(state.peaks.peakValues.staleReadAgeMs).toBe(17_600);
    });

    it("tracks monthly infrastructure cost that increases with both worker count and replica count", () => {
      let state = createInitialState(replicationBacklogSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = replicationBacklogSimulation.tickMs;
      state = simulate(
        replicationBacklogSimulation,
        state,
        { id: "scale-workers", timestampMs: 0, controlKey: REPLICATION_WORKER_COUNT_KEY, value: 16 },
        tickMs,
      ).state;
      state = simulate(
        replicationBacklogSimulation,
        state,
        { id: "scale-replicas", timestampMs: tickMs, controlKey: REPLICA_COUNT_KEY, value: 3 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 700 + 900);
    });
  });

  describe("Candidate-declared completion — no acceptable tier", () => {
    it("optimal via throttling is eligible for Finish", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(replicationBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("optimal via parallelism+batching is eligible for Finish", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: REPLICATION_WORKER_COUNT_KEY, value: 16 },
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "compressed-batch" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(replicationBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("reads-isolated (zero stale reads, but backlog still growing) is NOT eligible for any Finish tier", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: READ_ROUTING_KEY, value: "primary-for-fresh-reads" },
      ]);
      expect(state.values.staleReadAgeMs).toBe(0);
      const eligibility = evaluateCompletionEligibility(replicationBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("partial parallelism alone remains ineligible for any Finish tier", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: REPLICATION_WORKER_COUNT_KEY, value: 8 },
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "compressed-batch" },
      ]);
      const eligibility = evaluateCompletionEligibility(replicationBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        replicationBacklogSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal (throttled) -> resolved/optimal", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
      ]);
      const result = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (reads-isolated) -> declared_unstable, despite zero observed stale reads", () => {
      const state = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: READ_ROUTING_KEY, value: "primary-for-fresh-reads" },
      ]);
      const result = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(WRITE_SURGE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("sustained storage-pressure breach never auto-fails, and Finish still declares unstable in candidate_declared mode", () => {
      const state = runScenario(STORAGE_PRESSURE_CRITICAL_MS + 46_000);
      expect(state.status).not.toBe("failed");
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        replicationBacklogSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at t=0 does NOT resolve (incident has not started yet)", () => {
      const state = createInitialState(replicationBacklogSimulation);
      expect(state.incidentStartedAtMs).toBeNull();
      const eligibility = evaluateCompletionEligibility(replicationBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish right after the incident starts does NOT resolve either", () => {
      const state = runScenario(WRITE_SURGE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(WRITE_SURGE_MS);
      const result = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
      ];
      const runA = runScenario(WRITE_SURGE_MS + 40_000, actions);
      const runB = runScenario(WRITE_SURGE_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (throttled), good (parallelism), baseline, and harmful paths with coherent ordering", () => {
      const throttledState = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: WRITE_THROTTLE_LEVEL_KEY, value: "aggressive" },
      ]);
      const throttledFinish = evaluateCandidateDeclaredFinish(replicationBacklogSimulation, throttledState);
      const throttledScore = scoreAuthoredAttempt(
        REPLICATION_BACKLOG_SCORING,
        extractFinishScoringInputs(replicationBacklogSimulation, throttledFinish),
      );

      const parallelismState = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: REPLICATION_WORKER_COUNT_KEY, value: 16 },
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "compressed-batch" },
      ]);
      const parallelismFinish = evaluateCandidateDeclaredFinish(
        replicationBacklogSimulation,
        parallelismState,
      );
      const parallelismScore = scoreAuthoredAttempt(
        REPLICATION_BACKLOG_SCORING,
        extractFinishScoringInputs(replicationBacklogSimulation, parallelismFinish),
      );

      // Baseline/harmful/reads-isolated paths never reach Finish
      // eligibility — score them as never-resolved attempts via the
      // unresolved terminal override (no synthetic resolvedAtMs is
      // ever fabricated).
      const baselineState = runScenario(WRITE_SURGE_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        REPLICATION_BACKLOG_SCORING,
        extractScoringInputs(replicationBacklogSimulation, baselineState),
      );

      const harmfulState = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: BATCHING_MODE_KEY, value: "large-uncompressed-batch" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        REPLICATION_BACKLOG_SCORING,
        extractScoringInputs(replicationBacklogSimulation, harmfulState),
      );

      const readsIsolatedState = runScenario(WRITE_SURGE_MS + 40_000, [
        { atMs: WRITE_SURGE_MS + 1_000, controlKey: READ_ROUTING_KEY, value: "primary-for-fresh-reads" },
      ]);
      const readsIsolatedScore = scoreAuthoredAttempt(
        REPLICATION_BACKLOG_SCORING,
        extractScoringInputs(replicationBacklogSimulation, readsIsolatedState),
      );

      // NOTE (section 16/17 suspicious-score investigation): throttled
      // (865) scores higher than parallelism (790) despite both
      // reaching the SAME optimal successCondition at the SAME speed
      // (both actions land one tick after incident start) — the
      // difference is entirely costEfficiency (100 vs. 25). Raising
      // both replicationWorkerCount to 16 AND batchingMode to
      // compressed-batch to reach full recovery costs real
      // infrastructure money ($700/mo for 16 workers), while
      // aggressive write throttling costs none — a legitimate
      // reflection of each strategy's real tradeoff profile (ingest
      // throughput sacrificed vs. infrastructure spend), not a scoring
      // defect. Both reliability dimensions floor at 15/150 for the
      // same pre-existing, already-accepted engine-wide
      // criticalTimeRatio-on-a-near-instant-fix artifact documented in
      // Missing Database Index's scoring.ts — not something this
      // scenario's scoring redesigns.
      expect(throttledScore.total).toBe(865);
      expect(parallelismScore.total).toBe(790);
      expect(baselineScore.total).toBe(420);
      expect(harmfulScore.total).toBe(405);
      expect(readsIsolatedScore.total).toBe(420);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(throttledScore.total).toBeGreaterThan(baselineScore.total);
      expect(parallelismScore.total).toBeGreaterThan(baselineScore.total);
      // reads-isolated must never score above baseline just because
      // one customer-visible metric (stale-read age) looks perfect —
      // the backlog itself is equally unresolved in both cases, and
      // dataIntegrity correctly scores both the same way since neither
      // reaches replicationHealth === "throughput-matched".
      expect(readsIsolatedScore.total).toBe(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
