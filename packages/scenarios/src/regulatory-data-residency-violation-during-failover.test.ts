import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { regulatoryDataResidencyViolationDuringFailover } from "./regulatory-data-residency-violation-during-failover";
import {
  regulatoryDataResidencyViolationDuringFailoverSimulation,
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  FAIL_BACK_TO_EU_KEY,
  STAY_FAILED_OVER_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
  FILE_BREACH_NOTIFICATION_KEY,
} from "./regulatory-data-residency-violation-during-failover/definition";
import { REGULATORY_DATA_RESIDENCY_VIOLATION_DURING_FAILOVER_SCORING } from "./regulatory-data-residency-violation-during-failover/scoring";
import { regulatoryDataResidencyViolationDuringFailoverCandidateUI } from "./regulatory-data-residency-violation-during-failover/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = regulatoryDataResidencyViolationDuringFailoverSimulation;
const AUTOMATIC_FAILOVER_COMPLETES_MS = 45_000;
const EU_REGION_INFRASTRUCTURE_RECOVERS_MS = 180_000;

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

describe("Regulatory Data-Residency Violation During Cross-Region Failover", () => {
  it("carries real library metadata, is branching-structured, principal-level, and paid", () => {
    expect(regulatoryDataResidencyViolationDuringFailover.structure).toBe("branching");
    expect(regulatoryDataResidencyViolationDuringFailover.difficulty).toBe("principal");
    expect(regulatoryDataResidencyViolationDuringFailover.isFree).toBe(false);
    expect(regulatoryDataResidencyViolationDuringFailover.library?.category).toBe(
      "Security & Identity",
    );
    expect(regulatoryDataResidencyViolationDuringFailover.library?.primarySkill).toBeTruthy();
    expect(regulatoryDataResidencyViolationDuringFailover.library?.skills.length).toBeGreaterThan(0);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = regulatoryDataResidencyViolationDuringFailoverCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with EU and US regions both normal", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.euRequestAvailabilityPercent).toBe(99.9);
    expect(state.values.dataResidencyViolationMinutes).toBe(0);
    expect(state.values.euPersonalDataRecordsProcessedInUsCount).toBe(0);
  });

  it("the automatic failover restores EU availability while silently creating a residency violation — the misleading signal", () => {
    const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000);
    expect(state.values.euRequestAvailabilityPercent as number).toBeGreaterThanOrEqual(99);
    expect(state.values.euRequestLatencyMs as number).toBeLessThan(200);
    expect(state.values.dataResidencyViolationMinutes as number).toBeGreaterThan(0);
    expect(state.values.euPersonalDataRecordsProcessedInUsCount as number).toBeGreaterThan(0);
  });

  it("the EU region shows critical component health even while availability metrics read healthy", () => {
    const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000);
    expect(state.componentHealth["eu-region"]).toBe("critical");
    expect(state.componentHealth["us-failover-region"]).toBe("healthy");
  });

  it("a noise signal (support escalation count) does not drive the violation and stays low on the clean path", () => {
    const violating = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000);
    expect(violating.values.supportEscalationCount as number).toBeLessThan(10);
    const fixed = runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
      { atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000, controlKey: VERIFY_EU_REGION_RECOVERED_KEY, value: true },
      {
        atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
        controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
        value: true,
      },
    ]);
    expect(fixed.values.supportEscalationCount).toBe(1);
  });

  describe("the branching tradeoff — compliance risk vs. availability", () => {
    it("staying failed over keeps availability perfect but the violation keeps accruing — plausible but inferior", () => {
      const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 5_000, [
        { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: STAY_FAILED_OVER_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("stayed-failed-over");
      expect(state.values.euRequestAvailabilityPercent as number).toBeGreaterThanOrEqual(99);
      expect(state.values.dataResidencyViolationMinutes as number).toBeGreaterThan(0);
      expect(state.componentHealth["eu-region"]).toBe("critical");
    });

    it("forcing an early fail-back stops the violation but reopens the availability outage", () => {
      const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 5_000, [
        { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: FAIL_BACK_TO_EU_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("failed-back-early");
      expect(state.values.dataResidencyViolationMinutes).toBe(0);
      expect(state.values.euRequestAvailabilityPercent as number).toBeLessThan(75);
      expect(state.componentHealth["global-traffic-manager"]).toBe("degraded");
    });

    it("enabling the data-lock gateway before EU has genuinely recovered is the second trap — same reopened outage", () => {
      const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 5_000, [
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000,
          controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("gateway-enabled-early");
      expect(state.values.euRequestAvailabilityPercent as number).toBeLessThan(75);
    });
  });

  describe("the correct, well-timed fix — order independence", () => {
    it("investigating all three signals, waiting for genuine recovery, verifying, then enabling the gateway reaches the correlated path", () => {
      const state = runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000,
          controlKey: INSPECT_FAILOVER_ROUTING_LOGS_KEY,
          value: true,
        },
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 2_000,
          controlKey: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
          value: true,
        },
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 3_000,
          controlKey: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000,
          controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
          controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-failed-back-after-recovery");
      expect(state.componentHealth["eu-region"]).toBe("healthy");
      expect(state.componentHealth["us-failover-region"]).toBe("healthy");
      expect(state.values.dataResidencyViolationMinutes).toBe(0);
    });

    it("investigating in a different order (audit trail, then legal, then routing logs) reaches the same correlated path", () => {
      const state = runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000,
          controlKey: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
          value: true,
        },
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 2_000,
          controlKey: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
          value: true,
        },
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 3_000,
          controlKey: INSPECT_FAILOVER_ROUTING_LOGS_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000,
          controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
          controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-failed-back-after-recovery");
    });

    it("verifying and enabling the gateway after recovery without investigating first still resolves cleanly, but as a guessed fix", () => {
      const state = runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000,
          controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
          controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-failed-back-after-recovery");
      expect(state.componentHealth["eu-region"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires availability, violation duration, and in-US record count all recovered together", () => {
    const state = runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
      { atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000, controlKey: VERIFY_EU_REGION_RECOVERED_KEY, value: true },
      {
        atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
        controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
        value: true,
      },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("staying failed over the entire time never satisfies successCondition (violation never stops accruing)", () => {
    const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 20_000, [
      { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: STAY_FAILED_OVER_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).not.toBe("resolved");
  });

  it("stays active (never auto-fails) even after EU availability remains critical past the old sustained window", () => {
    const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000 + 61_000, [
      { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: FAIL_BACK_TO_EU_KEY, value: true },
    ]);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      {
        atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000,
        controlKey: INSPECT_FAILOVER_ROUTING_LOGS_KEY,
        value: true,
      },
      { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 2_000, controlKey: STAY_FAILED_OVER_KEY, value: true },
    ];
    const runA = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 10_000, actions);
    const runB = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  it("filing the breach notification is tracked as its own beneficial compliance action, independent of the availability strategy", () => {
    const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 5_000, [
      { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: STAY_FAILED_OVER_KEY, value: true },
      { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 2_000, controlKey: FILE_BREACH_NOTIFICATION_KEY, value: true },
    ]);
    expect(state.numberOfBeneficialChanges).toBeGreaterThanOrEqual(1);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(REGULATORY_DATA_RESIDENCY_VIOLATION_DURING_FAILOVER_SCORING, inputs);
    }

    function correlatedCleanRun() {
      return runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000,
          controlKey: INSPECT_FAILOVER_ROUTING_LOGS_KEY,
          value: true,
        },
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 2_000,
          controlKey: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
          value: true,
        },
        {
          atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 3_000,
          controlKey: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000,
          controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
          controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
          value: true,
        },
      ]);
    }

    function guessedCleanRun() {
      return runScenario(EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000, [
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000,
          controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
          value: true,
        },
        {
          atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
          controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
          value: true,
        },
      ]);
    }

    it("a candidate who correlates before acting scores strictly higher than one who guesses the same well-timed fix", () => {
      const correlatedScore = scoreOf(correlatedCleanRun()).total;
      const guessedScore = scoreOf(guessedCleanRun()).total;
      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who takes the correlated, well-timed path scores higher than one who forces an early fail-back", () => {
      const correlated = correlatedCleanRun();
      const earlyFailBack = runScenario(5 * 60_000, [
        { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: FAIL_BACK_TO_EU_KEY, value: true },
      ]);
      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(earlyFailBack).total);
    });

    it("a candidate who takes the correlated, well-timed path scores higher than one who stays failed over indefinitely", () => {
      const correlated = correlatedCleanRun();
      const stayedFailedOver = runScenario(5 * 60_000, [
        { atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000, controlKey: STAY_FAILED_OVER_KEY, value: true },
      ]);
      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(stayedFailedOver).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated investigationQuality value", () => {
      expect(scoreOf(correlatedCleanRun()).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessedCleanRun()).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const result = scoreOf(correlatedCleanRun());
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
    it("surfaces the in-US record count as root cause and violation duration as the observed effect", () => {
      const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000);
      const narrative = buildIncidentNarrative(
        regulatoryDataResidencyViolationDuringFailoverCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain(
        "EU Personal Data Records Processed in US",
      );
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Data Residency Violation Duration"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["EU Request Availability", "EU Request Latency"]),
      );
    });

    it("never surfaces the noise-tagged support escalation count in any narrative group", () => {
      const state = runScenario(AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000);
      const narrative = buildIncidentNarrative(
        regulatoryDataResidencyViolationDuringFailoverCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Support Escalation Count")).toBe(false);
    });
  });
});
