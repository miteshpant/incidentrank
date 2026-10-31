import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cronJobOverlapDoubleRun } from "./cron-job-overlap-double-run";
import {
  cronJobOverlapDoubleRunSimulation,
  INSPECT_JOB_RUN_HISTORY_KEY,
  INSPECT_SOURCE_TABLE_GROWTH_KEY,
  INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
  JOB_CONCURRENCY_GUARD_ENABLED_KEY,
  JOB_WORKER_COUNT_KEY,
  CRON_INTERVAL_MINUTES_KEY,
} from "./cron-job-overlap-double-run/definition";
import { CRON_JOB_OVERLAP_DOUBLE_RUN_SCORING } from "./cron-job-overlap-double-run/scoring";
import { cronJobOverlapDoubleRunCandidateUI } from "./cron-job-overlap-double-run/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = cronJobOverlapDoubleRunSimulation;
const OVERLAP_BEGINS_MS = 30_000;

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(SIM);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += SIM.tickMs) {
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

    const result = simulate(SIM, state, action, SIM.tickMs);
    state = result.state;
  }

  return state;
}

describe("Cron Job Overlap Double-Run", () => {
  it("carries real library metadata, is linear-structured, senior-level, and paid", () => {
    expect(cronJobOverlapDoubleRun.structure).toBe("linear");
    expect(cronJobOverlapDoubleRun.difficulty).toBe("senior");
    expect(cronJobOverlapDoubleRun.isFree).toBe(false);
    expect(cronJobOverlapDoubleRun.library?.category).toBe("Data Pipelines");
    expect(cronJobOverlapDoubleRun.library?.primarySkill).toBeTruthy();
    expect(cronJobOverlapDoubleRun.library?.skills.length).toBeGreaterThan(0);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = cronJobOverlapDoubleRunCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with a single run and no duplicate rows", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.concurrentRunCount).toBe(1);
    expect(state.values.dailyMetricsDuplicateRowPercent).toBe(0);
    expect(state.values.jobRunDurationMinutes).toBe(18);
  });

  it("the Source Orders Table stays healthy while the job and metrics table degrade — the misleading signal", () => {
    const state = runScenario(OVERLAP_BEGINS_MS + 1_000);
    expect(state.componentHealth["source-orders-table"]).toBe("healthy");
    expect(state.componentHealth["reconciliation-job"]).toBe("critical");
    expect(state.componentHealth["daily-metrics-table"]).toBe("critical");
  });

  it("concurrent run count rises to 2 and duplicate rows climb once overlap begins", () => {
    const state = runScenario(OVERLAP_BEGINS_MS + 1_000);
    expect(state.values.concurrentRunCount).toBe(2);
    expect(state.values.dailyMetricsDuplicateRowPercent as number).toBeGreaterThanOrEqual(40);
  });

  it("a noise signal (scheduler missed fire count) is unrelated to root cause and does not gate recovery", () => {
    const healthy = createInitialState(SIM);
    const overlapping = runScenario(OVERLAP_BEGINS_MS + 1_000);
    expect(overlapping.values.schedulerMissedFireCount as number).toBeGreaterThanOrEqual(
      healthy.values.schedulerMissedFireCount as number,
    );
    // The fix recovers the incident regardless of what this noise metric does.
    const fixed = runScenario(OVERLAP_BEGINS_MS + 20_000, [
      { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
    ]);
    expect(fixed.componentHealth["reconciliation-job"]).toBe("healthy");
  });

  describe("inferior remediation paths", () => {
    it("scaling up job workers alone is plausible but insufficient — overlap continues", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 5_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_WORKER_COUNT_KEY, value: 16 },
      ]);
      expect(state.values.diagnosisPath).toBe("scaled-workers-only");
      expect(state.values.concurrentRunCount).toBe(2);
      expect(state.values.dailyMetricsDuplicateRowPercent as number).toBeGreaterThan(20);
    });

    it("widening the cron interval alone is plausible but insufficient — an unusually slow run still overlaps", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 5_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: CRON_INTERVAL_MINUTES_KEY, value: 120 },
      ]);
      expect(state.values.diagnosisPath).toBe("widened-interval-only");
      expect(state.values.concurrentRunCount).toBe(2);
      expect(state.values.dailyMetricsDuplicateRowPercent as number).toBeGreaterThan(20);
    });
  });

  describe("the correct fix — enabling the concurrency guard", () => {
    it("investigating run history, then source growth, then row counts, then fixing — reaches the correlated path", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: INSPECT_JOB_RUN_HISTORY_KEY, value: true },
        { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
        {
          atMs: OVERLAP_BEGINS_MS + 3_000,
          controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
          value: true,
        },
        { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["reconciliation-job"]).toBe("healthy");
      expect(state.componentHealth["daily-metrics-table"]).toBe("healthy");
    });

    it("investigating row counts first, then source growth, then run history, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        {
          atMs: OVERLAP_BEGINS_MS + 1_000,
          controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
          value: true,
        },
        { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
        { atMs: OVERLAP_BEGINS_MS + 3_000, controlKey: INSPECT_JOB_RUN_HISTORY_KEY, value: true },
        { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("enabling the guard without investigating anything first still resolves the incident, but as a guessed fix", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["reconciliation-job"]).toBe("healthy");
      expect(state.componentHealth["daily-metrics-table"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires both concurrent run count and duplicate row percent recovered together", () => {
    const state = runScenario(OVERLAP_BEGINS_MS + 20_000, [
      { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after duplicate row percent remains critical past the old sustained window", () => {
    const state = runScenario(OVERLAP_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
      { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
    ];
    const runA = runScenario(OVERLAP_BEGINS_MS + 10_000, actions);
    const runB = runScenario(OVERLAP_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(CRON_JOB_OVERLAP_DOUBLE_RUN_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: INSPECT_JOB_RUN_HISTORY_KEY, value: true },
        { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
        {
          atMs: OVERLAP_BEGINS_MS + 3_000,
          controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
          value: true,
        },
        { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      const guessed = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);

      const correlatedScore = scoreOf(correlated).total;
      const guessedScore = scoreOf(guessed).total;

      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who chases inferior single-control remediations scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: INSPECT_JOB_RUN_HISTORY_KEY, value: true },
        { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
        {
          atMs: OVERLAP_BEGINS_MS + 3_000,
          controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
          value: true,
        },
        { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_WORKER_COUNT_KEY, value: 16 },
        { atMs: OVERLAP_BEGINS_MS + 30_000, controlKey: CRON_INTERVAL_MINUTES_KEY, value: 120 },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: INSPECT_JOB_RUN_HISTORY_KEY, value: true },
        { atMs: OVERLAP_BEGINS_MS + 2_000, controlKey: INSPECT_SOURCE_TABLE_GROWTH_KEY, value: true },
        {
          atMs: OVERLAP_BEGINS_MS + 3_000,
          controlKey: INSPECT_DAILY_METRICS_ROW_COUNTS_KEY,
          value: true,
        },
        { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      const guessed = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 1_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(OVERLAP_BEGINS_MS + 20_000, [
        { atMs: OVERLAP_BEGINS_MS + 4_000, controlKey: JOB_CONCURRENCY_GUARD_ENABLED_KEY, value: true },
      ]);
      const result = scoreOf(correlated);

      expect(result.maxPoints).toEqual({
        recovery: 300,
        customerImpact: 200,
        dataIntegrity: 200,
        reliability: 150,
        costEfficiency: 100,
        operationalEfficiency: 50,
      });
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces concurrent run count as the root cause and daily metrics drift as observed effects", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(cronJobOverlapDoubleRunCandidateUI, state.values);

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Concurrent Run Count");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Daily Metrics Duplicate Row %", "Daily Metrics Row Count"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Source Table Scan Latency"]),
      );
    });

    it("never surfaces the noise-tagged scheduler missed fire count in any narrative group", () => {
      const state = runScenario(OVERLAP_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(cronJobOverlapDoubleRunCandidateUI, state.values);
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Scheduler Missed Fire Count")).toBe(false);
    });
  });
});
