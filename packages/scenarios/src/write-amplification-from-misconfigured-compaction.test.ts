import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { writeAmplificationFromMisconfiguredCompaction } from "./write-amplification-from-misconfigured-compaction";
import {
  writeAmplificationFromMisconfiguredCompactionSimulation,
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  COMPACTION_LEVEL_MULTIPLIER_KEY,
  SCALE_UP_DISK_IOPS_KEY,
  THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
} from "./write-amplification-from-misconfigured-compaction/definition";
import { WRITE_AMPLIFICATION_FROM_MISCONFIGURED_COMPACTION_SCORING } from "./write-amplification-from-misconfigured-compaction/scoring";
import { writeAmplificationFromMisconfiguredCompactionCandidateUI } from "./write-amplification-from-misconfigured-compaction/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = writeAmplificationFromMisconfiguredCompactionSimulation;
const TRAFFIC_BUMP_BEGINS_MS = 30_000;

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

describe("Write Amplification from Misconfigured Storage Compaction", () => {
  it("carries real library metadata, is linear-structured, senior_staff-level, and paid", () => {
    expect(writeAmplificationFromMisconfiguredCompaction.structure).toBe("linear");
    expect(writeAmplificationFromMisconfiguredCompaction.difficulty).toBe("senior_staff");
    expect(writeAmplificationFromMisconfiguredCompaction.isFree).toBe(false);
    expect(writeAmplificationFromMisconfiguredCompaction.library?.category).toBe("Databases & Storage");
    expect(writeAmplificationFromMisconfiguredCompaction.library?.primarySkill).toBeTruthy();
    expect(writeAmplificationFromMisconfiguredCompaction.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1", () => {
    expect(writeAmplificationFromMisconfiguredCompaction.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = writeAmplificationFromMisconfiguredCompactionCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("tags at least one root_cause metric and at least one downstream_symptom metric", () => {
    const metrics = writeAmplificationFromMisconfiguredCompactionCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
  });

  it("tags at least one noise metric", () => {
    const metrics = writeAmplificationFromMisconfiguredCompactionCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "noise")).toBe(true);
  });

  it("starts healthy with the misconfiguration already live but producing no alertable symptom", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.diskIopsUtilizationPercent).toBe(38);
    expect(state.values.writeAmplificationFactor).toBeLessThan(3.5);
    expect(state.controlValues[COMPACTION_LEVEL_MULTIPLIER_KEY]).toBe(2);
  });

  it("the config service itself never shows degraded/critical health, even while saturated — the misleading 'nothing changed just now' signal", () => {
    const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 1_000);
    expect(state.componentHealth["config-service"]).toBe("healthy");
    expect(state.componentHealth["disk-iops"]).toBe("critical");
    expect(state.componentHealth["storage-engine"]).toBe("critical");
  });

  it("configChangeAgeDays stays constant at 21 days throughout — the root cause predates the incident and is never itself a timed event", () => {
    const healthy = createInitialState(SIM);
    const saturated = runScenario(TRAFFIC_BUMP_BEGINS_MS + 1_000);
    expect(healthy.values.configChangeAgeDays).toBe(21);
    expect(saturated.values.configChangeAgeDays).toBe(21);
  });

  it("the routine traffic bump exposes but does not itself cause the saturation — disk IOPS and write latency both spike only once trafficBumpActive fires", () => {
    const beforeBump = runScenario(TRAFFIC_BUMP_BEGINS_MS - 1_000);
    const afterBump = runScenario(TRAFFIC_BUMP_BEGINS_MS + 1_000);
    expect(beforeBump.values.diskIopsUtilizationPercent).toBeLessThan(50);
    expect(afterBump.values.diskIopsUtilizationPercent).toBeGreaterThanOrEqual(90);
    expect(afterBump.values.writeAmplificationFactor as number).toBeGreaterThan(
      beforeBump.values.writeAmplificationFactor as number,
    );
  });

  it("a noise signal (monitoring dashboard refresh lag) climbs during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const saturated = runScenario(TRAFFIC_BUMP_BEGINS_MS + 1_000);
    expect(saturated.values.monitoringDashboardRefreshLagSeconds as number).toBeGreaterThan(
      healthy.values.monitoringDashboardRefreshLagSeconds as number,
    );
    // Refresh lag stays unchanged by the correct fix — proving it never
    // factored into successCondition/failureCondition/rules.
    const fixed = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
      { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
    ]);
    expect(fixed.values.monitoringDashboardRefreshLagSeconds).toBe(3);
  });

  describe("inferior remediation paths", () => {
    it("scaling up disk IOPS alone is plausible but insufficient — write amplification stays high and the system re-saturates", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 5_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: SCALE_UP_DISK_IOPS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("scaled-iops-only");
      expect(state.values.writeAmplificationFactor).toBeGreaterThan(8);
      expect(state.componentHealth["storage-engine"]).toBe("degraded");
    });

    it("throttling compaction's background IO alone defers rather than fixes the problem — the backlog keeps growing", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 5_000, [
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000,
          controlKey: THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("throttled-compaction-only");
      expect(state.values.compactionBacklogSstables).toBeGreaterThan(500);
      expect(state.values.writeAmplificationFactor).toBeGreaterThan(8);
    });
  });

  describe("the correct fix — order independence", () => {
    it("investigating disk IOPS, then write amplification, then compaction config history, then fixing — reaches the correlated path", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: INSPECT_DISK_IOPS_METRICS_KEY, value: true },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000,
          controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
          value: true,
        },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 3_000,
          controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
          value: true,
        },
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["storage-engine"]).toBe("healthy");
      expect(state.componentHealth["disk-iops"]).toBe("healthy");
    });

    it("investigating compaction config history first, then write amplification, then disk IOPS, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000,
          controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
          value: true,
        },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000,
          controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
          value: true,
        },
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 3_000, controlKey: INSPECT_DISK_IOPS_METRICS_KEY, value: true },
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("fixing the multiplier without investigating anything first still resolves the incident, but as a guessed fix", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["storage-engine"]).toBe("healthy");
      expect(state.componentHealth["disk-iops"]).toBe("healthy");
    });

    it("raising the multiplier to 10 (beyond the recommended 8) still resolves the incident", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 10 },
      ]);
      expect(state.componentHealth["storage-engine"]).toBe("healthy");
    });

    it("a partial multiplier increase (4) relieves some pressure but is not enough", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 5_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 4 },
      ]);
      expect(state.values.diagnosisPath).toBe("partial-multiplier-increase");
      expect(state.values.diskIopsUtilizationPercent).toBeLessThan(97);
      expect(state.values.diskIopsUtilizationPercent).toBeGreaterThan(50);
    });
  });

  it("verification: successCondition requires write amplification, disk IOPS utilization, and write error rate all recovered together", () => {
    const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
      { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after disk IOPS utilization remains critical past the old sustained window", () => {
    const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      {
        atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000,
        controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
        value: true,
      },
      { atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
    ];
    const runA = runScenario(TRAFFIC_BUMP_BEGINS_MS + 10_000, actions);
    const runB = runScenario(TRAFFIC_BUMP_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(WRITE_AMPLIFICATION_FROM_MISCONFIGURED_COMPACTION_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: INSPECT_DISK_IOPS_METRICS_KEY, value: true },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000,
          controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
          value: true,
        },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 3_000,
          controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
          value: true,
        },
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      const guessed = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);

      const correlatedScore = scoreOf(correlated).total;
      const guessedScore = scoreOf(guessed).total;

      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who randomly chases an inferior remediation scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: INSPECT_DISK_IOPS_METRICS_KEY, value: true },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000,
          controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
          value: true,
        },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 3_000,
          controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
          value: true,
        },
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: SCALE_UP_DISK_IOPS_KEY, value: true },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 30_000,
          controlKey: THROTTLE_COMPACTION_BACKGROUND_IO_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: INSPECT_DISK_IOPS_METRICS_KEY, value: true },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000,
          controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
          value: true,
        },
        {
          atMs: TRAFFIC_BUMP_BEGINS_MS + 3_000,
          controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
          value: true,
        },
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      const guessed = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("scaling up disk IOPS costs real ongoing infrastructure money, unlike raising the compaction multiplier", () => {
      const scaled = runScenario(TRAFFIC_BUMP_BEGINS_MS + 5_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: SCALE_UP_DISK_IOPS_KEY, value: true },
      ]);
      const fixed = runScenario(TRAFFIC_BUMP_BEGINS_MS + 5_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
      ]);
      expect(scaled.cost.currentMonthlyCostUsd).toBeGreaterThan(fixed.cost.currentMonthlyCostUsd);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(TRAFFIC_BUMP_BEGINS_MS + 20_000, [
        { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
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
      expect(
        result.maxPoints.recovery +
          result.maxPoints.customerImpact +
          result.maxPoints.dataIntegrity +
          result.maxPoints.reliability +
          result.maxPoints.costEfficiency +
          result.maxPoints.operationalEfficiency,
      ).toBe(1000);
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces write amplification and config change age as the root cause and latency/IOPS as observed effects", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        writeAmplificationFromMisconfiguredCompactionCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Write Amplification Factor", "Compaction Config Last Changed (days ago)"]),
      );
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Write Latency (p99)", "Disk IOPS Utilization"]),
      );
    });

    it("never surfaces the noise-tagged monitoring dashboard refresh lag in any narrative group", () => {
      const state = runScenario(TRAFFIC_BUMP_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        writeAmplificationFromMisconfiguredCompactionCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Monitoring Dashboard Refresh Lag")).toBe(false);
    });
  });
});
