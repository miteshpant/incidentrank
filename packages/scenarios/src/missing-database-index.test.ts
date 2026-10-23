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
import { missingDatabaseIndex } from "./missing-database-index";
import {
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  missingDatabaseIndexSimulation,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TARGETED_INDEX_ENABLED_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
} from "./missing-database-index/definition";
import { missingDatabaseIndexCandidateUI } from "./missing-database-index/candidate-ui";
import { MISSING_DATABASE_INDEX_SCORING } from "./missing-database-index/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(missingDatabaseIndexSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += missingDatabaseIndexSimulation.tickMs
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
      missingDatabaseIndexSimulation,
      state,
      action,
      missingDatabaseIndexSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const TRAFFIC_RISING_MS = 30_000;

describe("Missing Database Index", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(missingDatabaseIndex.isFree).toBe(false);
      expect(missingDatabaseIndex.library?.category).toBe("Databases & Storage");
      expect(missingDatabaseIndex.library?.tags.length).toBeGreaterThan(0);
      expect(missingDatabaseIndex.library?.skills.length).toBeGreaterThan(0);
      expect(missingDatabaseIndex.difficulty).toBe("intermediate");
    });

    it("has a complete scoring config across all six dimensions", () => {
      const dims = MISSING_DATABASE_INDEX_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = MISSING_DATABASE_INDEX_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(missingDatabaseIndexCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(missingDatabaseIndexCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(missingDatabaseIndexCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(missingDatabaseIndexSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.dbCpuUtilization).toBe(12);
      expect(state.values.orderHistoryQueryHealth).toBe("unresolved");
    });

    it("traffic rising triggers the full-table-scan baseline incident", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(TRAFFIC_RISING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.dbCpuUtilization).toBe(88);
      expect(state.values.scannedRowsPerQuery).toBe(850_000);
      expect(state.values.dbStatus).toBe("critical");
    });

    it("strong path: enabling the targeted index resolves scanning regardless of other controls", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
      ]);
      expect(state.values.dbCpuUtilization).toBe(18);
      expect(state.values.scannedRowsPerQuery).toBe(12);
      expect(state.values.orderHistoryQueryHealth).toBe("indexed");
      expect(state.values.dbStatus).toBe("normal");
    });

    it("harmful path: scaling API instances while the index is missing makes DB CPU worse than baseline", () => {
      const baseline = runScenario(TRAFFIC_RISING_MS + 20_000);
      const scaled = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);

      expect(scaled.values.dbCpuUtilization).toBeGreaterThan(
        baseline.values.dbCpuUtilization as number,
      );
      expect(scaled.values.scannedRowsPerQuery).toBeGreaterThan(
        baseline.values.scannedRowsPerQuery as number,
      );
      expect(scaled.values.dbStatus).toBe("critical");
    });

    it("harmful path: widening the DB connection pool alone also worsens DB CPU rather than fixing it", () => {
      const baseline = runScenario(TRAFFIC_RISING_MS + 20_000);
      const widened = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: DB_CONNECTION_POOL_SIZE_KEY, value: 200 },
      ]);

      expect(widened.values.dbCpuUtilization).toBeGreaterThan(
        baseline.values.dbCpuUtilization as number,
      );
      expect(widened.values.dbStatus).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.dbStatus).toBe("critical");
    });

    it("delayed consequence: sustained unmitigated load saturates the connection pool on a second wave", () => {
      const beforeSecondWave = runScenario(TRAFFIC_RISING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.dbConnectionUtilization).toBeGreaterThanOrEqual(80);
      expect(beforeSecondWave.values.requestQueueDepth).toBeGreaterThan(0);

      const afterSecondWave = runScenario(TRAFFIC_RISING_MS + 3 * 60_000 + 5_000);
      expect(afterSecondWave.values.dbConnectionUtilization).toBe(99);
      expect(afterSecondWave.values.requestQueueDepth).toBe(620);
    });

    it("acceptable path: disabling the endpoint recovers every metric but marks the feature disabled, not fixed", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        {
          atMs: TRAFFIC_RISING_MS + 1_000,
          controlKey: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
          value: false,
        },
      ]);
      expect(state.values.dbCpuUtilization).toBe(14);
      expect(state.values.dbStatus).toBe("normal");
      expect(state.values.orderHistoryQueryHealth).toBe("feature-disabled");
    });

    it("partial path: reducing query page size alone gives relief but stays degraded", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: QUERY_PAGE_SIZE_KEY, value: 25 },
      ]);
      expect(state.values.dbCpuUtilization).toBe(62);
      expect(state.values.dbStatus).toBe("warning");
      expect(state.values.orderHistoryQueryHealth).toBe("unresolved");
    });

    it("partial path: enabling the temporary cache without the index gives relief but stays degraded", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TEMPORARY_CACHE_ENABLED_KEY, value: true },
      ]);
      expect(state.values.dbCpuUtilization).toBe(58);
      expect(state.values.dbStatus).toBe("warning");
    });

    it("fails if DB CPU stays at or above 95% for the full sustained window", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 3 * 60_000 + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak DB CPU and peak scanned rows generically via numericWatchFields", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 1_000);
      expect(state.peaks.peakValues.dbCpuUtilization).toBe(88);
      expect(state.peaks.peakValues.scannedRowsPerQuery).toBe(850_000);
    });

    it("tracks monthly infrastructure cost that increases with both API instances and pool size", () => {
      let state = createInitialState(missingDatabaseIndexSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(400);

      const tickMs = missingDatabaseIndexSimulation.tickMs;
      state = simulate(
        missingDatabaseIndexSimulation,
        state,
        { id: "scale-api", timestampMs: 0, controlKey: API_INSTANCE_COUNT_KEY, value: 32 },
        tickMs,
      ).state;
      state = simulate(
        missingDatabaseIndexSimulation,
        state,
        { id: "scale-pool", timestampMs: tickMs, controlKey: DB_CONNECTION_POOL_SIZE_KEY, value: 200 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(400 + 1_100 + 340);
    });
  });

  describe("Phase 6.1: two-tier completion — indexed (optimal) vs endpoint-disabled (acceptable)", () => {
    it("indexed, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(missingDatabaseIndexSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("endpoint disabled, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        {
          atMs: TRAFFIC_RISING_MS + 1_000,
          controlKey: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
          value: false,
        },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(missingDatabaseIndexSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("page-size reduction alone remains ineligible for any Finish tier", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: QUERY_PAGE_SIZE_KEY, value: 25 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(missingDatabaseIndexSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        missingDatabaseIndexSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        {
          atMs: TRAFFIC_RISING_MS + 1_000,
          controlKey: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
          value: false,
        },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        missingDatabaseIndexSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(missingDatabaseIndexSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000, [
        {
          atMs: TRAFFIC_RISING_MS + 1_000,
          controlKey: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
          value: false,
        },
      ]);
      const result = evaluateCandidateDeclaredFinish(missingDatabaseIndexSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(missingDatabaseIndexSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(TRAFFIC_RISING_MS + 3 * 60_000 + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(missingDatabaseIndexSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(TRAFFIC_RISING_MS + 20_000, actions);
      const runB = runScenario(TRAFFIC_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (indexed), baseline, harmful (scaled API), and acceptable (endpoint disabled) paths with coherent ordering", () => {
      const goodState = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: TARGETED_INDEX_ENABLED_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(missingDatabaseIndexSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        MISSING_DATABASE_INDEX_SCORING,
        extractFinishScoringInputs(missingDatabaseIndexSimulation, goodFinish),
      );

      const acceptableState = runScenario(TRAFFIC_RISING_MS + 20_000, [
        {
          atMs: TRAFFIC_RISING_MS + 1_000,
          controlKey: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
          value: false,
        },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        missingDatabaseIndexSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        MISSING_DATABASE_INDEX_SCORING,
        extractFinishScoringInputs(missingDatabaseIndexSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(TRAFFIC_RISING_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        MISSING_DATABASE_INDEX_SCORING,
        extractScoringInputs(missingDatabaseIndexSimulation, baselineState),
      );

      const harmfulState = runScenario(TRAFFIC_RISING_MS + 20_000, [
        { atMs: TRAFFIC_RISING_MS + 1_000, controlKey: API_INSTANCE_COUNT_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        MISSING_DATABASE_INDEX_SCORING,
        extractScoringInputs(missingDatabaseIndexSimulation, harmfulState),
      );

      // NOTE (section 16/17 suspicious-tie investigation): recovery,
      // customerImpact, and reliability legitimately tie between
      // goodScore and acceptableScore here — both mitigations are
      // applied one tick after incident start in this test, so both
      // recover the customer-facing metrics equally fast. reliability's
      // floor-band 15 for BOTH is a pre-existing, already-accepted
      // engine-wide artifact of criticalTimeRatio's tiny denominator on
      // a near-instant fix (also present in Kafka Partition Skew's own
      // fastest-recovery path) — not something this scenario's scoring
      // redesigns, per section 17's binding instruction. dataIntegrity
      // is the dimension that correctly discriminates optimal from
      // acceptable (see scoring.ts's finalStringEquals measure on
      // orderHistoryQueryHealth), which is why the totals differ.
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(825);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
