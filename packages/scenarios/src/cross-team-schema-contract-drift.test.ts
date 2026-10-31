import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { crossTeamSchemaContractDrift } from "./cross-team-schema-contract-drift";
import {
  crossTeamSchemaContractDriftSimulation,
  INSPECT_SCHEMA_DIFF_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
} from "./cross-team-schema-contract-drift/definition";
import { CROSS_TEAM_SCHEMA_CONTRACT_DRIFT_SCORING } from "./cross-team-schema-contract-drift/scoring";
import { crossTeamSchemaContractDriftCandidateUI } from "./cross-team-schema-contract-drift/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = crossTeamSchemaContractDriftSimulation;
const DRIFT_BEGINS_MS = 30_000;

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

const ALL_THREE_FIXED: TimedAction[] = [
  { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: INSPECT_SCHEMA_DIFF_KEY, value: true },
  { atMs: DRIFT_BEGINS_MS + 2_000, controlKey: INSPECT_BILLING_ERRORS_KEY, value: true },
  { atMs: DRIFT_BEGINS_MS + 3_000, controlKey: INSPECT_ANALYTICS_DRIFT_KEY, value: true },
  {
    atMs: DRIFT_BEGINS_MS + 4_000,
    controlKey: INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
    value: true,
  },
  { atMs: DRIFT_BEGINS_MS + 5_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
  { atMs: DRIFT_BEGINS_MS + 6_000, controlKey: REDEPLOY_BILLING_MAPPER_KEY, value: true },
  { atMs: DRIFT_BEGINS_MS + 7_000, controlKey: BACKFILL_ANALYTICS_WAREHOUSE_KEY, value: true },
  { atMs: DRIFT_BEGINS_MS + 8_000, controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY, value: true },
];

describe("Cross-Team Schema Contract Drift", () => {
  it("carries real library metadata, is cascading-structured, senior_staff-level, and paid", () => {
    expect(crossTeamSchemaContractDrift.structure).toBe("cascading");
    expect(crossTeamSchemaContractDrift.difficulty).toBe("senior_staff");
    expect(crossTeamSchemaContractDrift.isFree).toBe(false);
    expect(crossTeamSchemaContractDrift.library?.category).toBe("Data Pipelines");
    expect(crossTeamSchemaContractDrift.library?.primarySkill).toBeTruthy();
    expect(crossTeamSchemaContractDrift.library?.skills.length).toBeGreaterThan(0);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = crossTeamSchemaContractDriftCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with all three consumer pipelines normal", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.schemaViolationRatePercent).toBe(0);
    expect(state.values.billingDroppedEventCount).toBe(0);
    expect(state.values.analyticsCorruptedRowPercent).toBe(0);
    expect(state.values.fraudConsumerLagSeconds).toBe(4);
  });

  it("all three downstream pipelines degrade differently once drift begins", () => {
    const state = runScenario(DRIFT_BEGINS_MS + 1_000);
    expect(state.componentHealth["orders-service"]).toBe("degraded");
    expect(state.componentHealth["billing-pipeline"]).toBe("critical");
    expect(state.componentHealth["analytics-warehouse"]).toBe("critical");
    expect(state.componentHealth["fraud-detection"]).toBe("critical");
    // Each pipeline's own distinct failure signature is present.
    expect(state.values.billingDroppedEventCount as number).toBeGreaterThan(0);
    expect(state.values.analyticsCorruptedRowPercent as number).toBeGreaterThan(0);
    expect(state.values.fraudConsumerLagSeconds as number).toBeGreaterThan(100);
  });

  it("a noise signal (warehouse compaction queue depth) climbs on its own schedule but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const afterCompactionStarts = runScenario(DRIFT_BEGINS_MS + 16_000);
    expect(afterCompactionStarts.values.warehouseCompactionQueueDepth as number).toBeGreaterThan(
      healthy.values.warehouseCompactionQueueDepth as number,
    );
    // The noise metric is not driven down by the correct full fix either
    // — proving it never factored into successCondition/failureCondition/rules.
    const fixed = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
    expect(fixed.values.warehouseCompactionQueueDepth).toBe(6);
  });

  describe("inferior and partial remediation paths", () => {
    it("restarting Fraud Detection's pods alone is plausible but insufficient — it relapses", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 5_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: RESTART_FRAUD_DETECTION_PODS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-fraud-pods-only");
      expect(state.values.fraudConsumerLagSeconds as number).toBeGreaterThan(100);
      expect(state.componentHealth["billing-pipeline"]).toBe("critical");
      expect(state.componentHealth["analytics-warehouse"]).toBe("critical");
    });

    it("publishing the shim alone with no consumer follow-up stops new violations but leaves every consumer unrecovered", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 5_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("shim-only");
      expect(state.values.schemaViolationRatePercent).toBe(0);
      expect(state.componentHealth["billing-pipeline"]).toBe("critical");
      expect(state.componentHealth["analytics-warehouse"]).toBe("critical");
      expect(state.componentHealth["fraud-detection"]).toBe("critical");
    });

    it("fixing only the loudest pipeline (Fraud Detection) leaves both silent failures (Billing, Analytics) still active — the central triage trap", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 5_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
        {
          atMs: DRIFT_BEGINS_MS + 2_000,
          controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("fraud-only");
      expect(state.componentHealth["fraud-detection"]).toBe("healthy");
      expect(state.componentHealth["billing-pipeline"]).toBe("critical");
      expect(state.componentHealth["analytics-warehouse"]).toBe("critical");
      expect(state.values.analyticsCorruptedRowPercent as number).toBeGreaterThan(50);
    });

    it("fixing two of three (Billing + Fraud) leaves Analytics silently corrupting new rows", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 5_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
        { atMs: DRIFT_BEGINS_MS + 2_000, controlKey: REDEPLOY_BILLING_MAPPER_KEY, value: true },
        {
          atMs: DRIFT_BEGINS_MS + 3_000,
          controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("billing-and-fraud-only");
      expect(state.componentHealth["analytics-warehouse"]).toBe("critical");
      expect(state.values.analyticsCorruptedRowPercent as number).toBeGreaterThan(0);
    });

    it("fixing two of three (Billing + Analytics) leaves Fraud Detection still crash-looping", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 5_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
        { atMs: DRIFT_BEGINS_MS + 2_000, controlKey: REDEPLOY_BILLING_MAPPER_KEY, value: true },
        {
          atMs: DRIFT_BEGINS_MS + 3_000,
          controlKey: BACKFILL_ANALYTICS_WAREHOUSE_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("billing-and-analytics-only");
      expect(state.componentHealth["fraud-detection"]).toBe("critical");
      expect(state.values.fraudConsumerLagSeconds as number).toBeGreaterThan(100);
    });
  });

  describe("the correct, fully-triaged fix across all three independent consumers", () => {
    it("investigating all four sources, then shim + all three consumer fixes in that order — reaches full recovery", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
      expect(state.values.diagnosisPath).toBe("fully-recovered-all-three");
      expect(state.componentHealth["billing-pipeline"]).toBe("healthy");
      expect(state.componentHealth["analytics-warehouse"]).toBe("healthy");
      expect(state.componentHealth["fraud-detection"]).toBe("healthy");
    });

    it("a different order — fixing Analytics, then Fraud, then Billing, then the shim last — reaches the same fully-recovered path", () => {
      const reordered: TimedAction[] = [
        {
          atMs: DRIFT_BEGINS_MS + 1_000,
          controlKey: BACKFILL_ANALYTICS_WAREHOUSE_KEY,
          value: true,
        },
        {
          atMs: DRIFT_BEGINS_MS + 2_000,
          controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY,
          value: true,
        },
        { atMs: DRIFT_BEGINS_MS + 3_000, controlKey: REDEPLOY_BILLING_MAPPER_KEY, value: true },
        { atMs: DRIFT_BEGINS_MS + 4_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
      ];
      const state = runScenario(DRIFT_BEGINS_MS + 20_000, reordered);
      expect(state.values.diagnosisPath).toBe("fully-recovered-all-three");
      expect(state.componentHealth["billing-pipeline"]).toBe("healthy");
      expect(state.componentHealth["analytics-warehouse"]).toBe("healthy");
      expect(state.componentHealth["fraud-detection"]).toBe("healthy");
    });

    it("billingDroppedEventCount freezes rather than reverses — already-lost events stay lost even after full recovery", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
      expect(state.values.billingDroppedEventCount).toBe(340);
      expect(state.values.billingDroppedEventCount as number).toBeGreaterThan(0);
    });
  });

  it("verification: successCondition requires schema violations, Billing, Analytics, AND Fraud all recovered simultaneously", () => {
    const state = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("the shim-only path does NOT satisfy successCondition — stopping new violations is not full recovery", () => {
    const state = runScenario(DRIFT_BEGINS_MS + 20_000, [
      { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).not.toBe("resolved");
  });

  it("stays active (never auto-fails) even after Analytics corruption remains critical past the old sustained window", () => {
    const state = runScenario(DRIFT_BEGINS_MS + 91_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      {
        atMs: DRIFT_BEGINS_MS + 1_000,
        controlKey: INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
        value: true,
      },
      { atMs: DRIFT_BEGINS_MS + 2_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
    ];
    const runA = runScenario(DRIFT_BEGINS_MS + 10_000, actions);
    const runB = runScenario(DRIFT_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored triage-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(CROSS_TEAM_SCHEMA_CONTRACT_DRIFT_SCORING, inputs);
    }

    it("a candidate who fully triages all three consumers scores strictly higher than one who fixes only the loudest pipeline", () => {
      const fullyTriaged = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
      const loudestOnly = runScenario(DRIFT_BEGINS_MS + 5 * 60_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
        {
          atMs: DRIFT_BEGINS_MS + 2_000,
          controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(fullyTriaged).total).toBeGreaterThan(scoreOf(loudestOnly).total);
    });

    it("a candidate who randomly restarts Fraud Detection pods scores lower than one who takes the fully-triaged path", () => {
      const fullyTriaged = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
      const randomExploration = runScenario(5 * 60_000, [
        {
          atMs: DRIFT_BEGINS_MS + 1_000,
          controlKey: RESTART_FRAUD_DETECTION_PODS_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(fullyTriaged).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the fully-recovered-all-three diagnosisPath", () => {
      const fullyTriaged = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
      const loudestOnly = runScenario(DRIFT_BEGINS_MS + 20_000, [
        { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
        {
          atMs: DRIFT_BEGINS_MS + 2_000,
          controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(fullyTriaged).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(loudestOnly).breakdown.dataIntegrity).toBe(70);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const fullyTriaged = runScenario(DRIFT_BEGINS_MS + 25_000, ALL_THREE_FIXED);
      const result = scoreOf(fullyTriaged);

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
    it("surfaces schema violation rate as the root cause and each pipeline's own symptom as an observed effect", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        crossTeamSchemaContractDriftCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Schema Violation Rate");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining([
          "Billing Dropped Event Count",
          "Analytics Corrupted Row Percent",
          "Fraud Detection Consumer Lag",
        ]),
      );
    });

    it("never surfaces the noise-tagged warehouse compaction queue depth in any narrative group", () => {
      const state = runScenario(DRIFT_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        crossTeamSchemaContractDriftCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Warehouse Compaction Queue Depth")).toBe(false);
    });
  });
});
