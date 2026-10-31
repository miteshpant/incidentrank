import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { multiAzStorageFailureDuringMigration } from "./multi-az-storage-failure-during-migration";
import {
  multiAzStorageFailureDuringMigrationSimulation,
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  PAUSE_MIGRATION_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
} from "./multi-az-storage-failure-during-migration/definition";
import { MULTI_AZ_STORAGE_FAILURE_DURING_MIGRATION_SCORING } from "./multi-az-storage-failure-during-migration/scoring";
import { multiAzStorageFailureDuringMigrationCandidateUI } from "./multi-az-storage-failure-during-migration/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = multiAzStorageFailureDuringMigrationSimulation;
const AZ_A_DEGRADES_MS = 30_000;
const CASCADE_BEGINS_MS = 75_000;

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

describe("Multi-AZ Storage Failure During Live Migration", () => {
  it("carries real library metadata, is cascading-structured, staff-level, and paid", () => {
    expect(multiAzStorageFailureDuringMigration.structure).toBe("cascading");
    expect(multiAzStorageFailureDuringMigration.difficulty).toBe("staff");
    expect(multiAzStorageFailureDuringMigration.isFree).toBe(false);
    expect(multiAzStorageFailureDuringMigration.library?.category).toBe("Databases & Storage");
    expect(multiAzStorageFailureDuringMigration.library?.primarySkill).toBeTruthy();
    expect(multiAzStorageFailureDuringMigration.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1 and a slug matching the directory name", () => {
    expect(multiAzStorageFailureDuringMigration.version).toBe(1);
    expect(multiAzStorageFailureDuringMigration.slug).toBe("multi-az-storage-failure-during-migration");
    expect(multiAzStorageFailureDuringMigration.id).toBe("multi-az-storage-failure-during-migration");
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = multiAzStorageFailureDuringMigrationCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("includes at least one root_cause, one downstream_symptom, and one noise metric", () => {
    const metrics = multiAzStorageFailureDuringMigrationCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "noise")).toBe(true);
  });

  it("starts healthy with App Service, AZ-A, and AZ-C all normal", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.appServiceErrorRatePercent).toBe(0.2);
    expect(state.values.azAVolumeIoErrorRatePercent).toBe(0.5);
    expect(state.values.azCConnectionUtilizationPercent).toBe(22);
  });

  it("AZ-A degrades first, independently of AZ-C — the first failure in the cascade", () => {
    const state = runScenario(AZ_A_DEGRADES_MS + 1_000);
    expect(state.componentHealth["storage-az-a"]).toBe("degraded");
    expect(state.componentHealth["storage-az-c"]).toBe("healthy");
    expect(state.values.azCConnectionUtilizationPercent).toBeLessThan(40);
  });

  it("the migration controller's retries then cascade the overload onto AZ-C — the second, distinct failure", () => {
    const state = runScenario(CASCADE_BEGINS_MS + 1_000);
    expect(state.componentHealth["storage-az-a"]).toBe("critical");
    expect(state.componentHealth["storage-az-c"]).toBe("critical");
    expect(state.componentHealth["app-service"]).toBe("critical");
    expect(state.values.azCConnectionUtilizationPercent).toBeGreaterThanOrEqual(90);
    expect(state.values.migrationRetryRatePerMinute as number).toBeGreaterThan(40);
  });

  it("a noise signal (migration controller CPU) climbs during the incident but is unrelated to the actual fix", () => {
    const healthy = createInitialState(SIM);
    const cascading = runScenario(CASCADE_BEGINS_MS + 1_000);
    expect(cascading.values.controllerCpuPercent as number).toBeGreaterThan(
      healthy.values.controllerCpuPercent as number,
    );
    // Controller CPU is not read by success/failure conditions or rules'
    // matching logic — it never gates recovery.
    const fixed = runScenario(CASCADE_BEGINS_MS + 20_000, [
      { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
      {
        atMs: CASCADE_BEGINS_MS + 2_000,
        controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
        value: 50,
      },
    ]);
    expect(fixed.values.controllerCpuPercent).toBe(10);
  });

  describe("inferior remediation paths", () => {
    it("restarting AZ-A's volumes alone is plausible but insufficient — the cascade continues unabated", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 5_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: RESTART_AZ_A_VOLUMES_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-az-a-only");
      expect(state.componentHealth["storage-az-c"]).toBe("critical");
      expect(state.values.azCConnectionUtilizationPercent).toBeGreaterThanOrEqual(90);
    });

    it("failing 100% of traffic to AZ-C without pausing migration first actively worsens the cascade", () => {
      const cascading = runScenario(CASCADE_BEGINS_MS + 1_000);
      const worsened = runScenario(CASCADE_BEGINS_MS + 5_000, [
        {
          atMs: CASCADE_BEGINS_MS + 1_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 100,
        },
      ]);
      expect(worsened.values.diagnosisPath).toBe("full-failover-without-pausing-migration");
      expect(worsened.values.azCConnectionUtilizationPercent as number).toBeGreaterThanOrEqual(
        cascading.values.azCConnectionUtilizationPercent as number,
      );
      expect(worsened.componentHealth["storage-az-c"]).toBe("critical");
    });

    it("pausing migration alone, without failing traffic over, only partially relieves customer impact", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 5_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("paused-migration-only");
      expect(state.values.migrationRetryRatePerMinute).toBe(0);
      expect(state.componentHealth["app-service"]).not.toBe("healthy");
    });
  });

  describe("the correct, correlated fix — order independence", () => {
    it("investigating AZ-A, then migration logs, then AZ-C, then fixing — reaches the correlated path", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY,
          value: true,
        },
        { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["app-service"]).toBe("healthy");
      expect(state.componentHealth["storage-az-c"]).toBe("healthy");
    });

    it("investigating AZ-C first, then migration logs, then AZ-A, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY,
          value: true,
        },
        { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("applying the two-part fix without investigating anything first still resolves the cascade, but as a guessed fix", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["app-service"]).toBe("healthy");
      expect(state.componentHealth["storage-az-c"]).toBe("healthy");
    });

    it("a full 100% controlled failover (paired with pausing migration) also reaches the correlated path", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY,
          value: true,
        },
        { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 100,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["app-service"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires App Service, AZ-C utilization, and the migration retry rate all recovered together", () => {
    const state = runScenario(CASCADE_BEGINS_MS + 20_000, [
      { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
      {
        atMs: CASCADE_BEGINS_MS + 2_000,
        controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
        value: 50,
      },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("declaring Finish too early (cascade still active) does not resolve", () => {
    const state = runScenario(CASCADE_BEGINS_MS + 5_000);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).not.toBe("resolved");
  });

  it("stays active (never auto-fails) even after AZ-C connection utilization remains critical past the old sustained window", () => {
    const state = runScenario(CASCADE_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
      { atMs: CASCADE_BEGINS_MS + 2_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
      {
        atMs: CASCADE_BEGINS_MS + 3_000,
        controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
        value: 50,
      },
    ];
    const runA = runScenario(CASCADE_BEGINS_MS + 10_000, actions);
    const runB = runScenario(CASCADE_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(MULTI_AZ_STORAGE_FAILURE_DURING_MIGRATION_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY,
          value: true,
        },
        { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);
      const guessed = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("a candidate who chases the harmful full-failover path scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY,
          value: true,
        },
        { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);
      const harmfulExploration = runScenario(5 * 60_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: RESTART_AZ_A_VOLUMES_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 30_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 100,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(harmfulExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: INSPECT_AZ_A_VOLUME_HEALTH_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: INSPECT_MIGRATION_RETRY_LOGS_KEY,
          value: true,
        },
        { atMs: CASCADE_BEGINS_MS + 3_000, controlKey: INSPECT_AZ_C_SATURATION_KEY, value: true },
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);
      const guessed = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 1_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 2_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(CASCADE_BEGINS_MS + 20_000, [
        { atMs: CASCADE_BEGINS_MS + 4_000, controlKey: PAUSE_MIGRATION_KEY, value: true },
        {
          atMs: CASCADE_BEGINS_MS + 5_000,
          controlKey: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
          value: 50,
        },
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
    it("surfaces AZ-A volume I/O errors as the root cause and App Service/AZ-C metrics as observed effects", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        multiAzStorageFailureDuringMigrationCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("AZ-A Volume I/O Error Rate");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["App Service Error Rate", "AZ-C Connection Utilization"]),
      );
      expect(narrative.contributingFactors.map((e) => e.label)).toContain(
        "Migration Controller Retry Rate",
      );
    });

    it("never surfaces the noise-tagged migration controller CPU in any narrative group", () => {
      const state = runScenario(CASCADE_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        multiAzStorageFailureDuringMigrationCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Migration Controller CPU")).toBe(false);
    });
  });
});
