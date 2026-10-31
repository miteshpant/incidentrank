import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { apiVersionSunsetBreaksSilentConsumers } from "./api-version-sunset-breaks-silent-consumers";
import {
  apiVersionSunsetBreaksSilentConsumersSimulation,
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  ENABLE_COMPATIBILITY_SHIM_KEY,
  FORCE_HARD_CUTOVER_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "./api-version-sunset-breaks-silent-consumers/definition";
import { API_VERSION_SUNSET_BREAKS_SILENT_CONSUMERS_SCORING } from "./api-version-sunset-breaks-silent-consumers/scoring";
import { apiVersionSunsetBreaksSilentConsumersCandidateUI } from "./api-version-sunset-breaks-silent-consumers/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = apiVersionSunsetBreaksSilentConsumersSimulation;
const SUNSET_TAKES_EFFECT_MS = 30_000;

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

const FULL_INVESTIGATION: TimedAction[] = [
  { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: INSPECT_CONSUMER_REGISTRY_KEY, value: true },
  { atMs: SUNSET_TAKES_EFFECT_MS + 2_000, controlKey: INSPECT_GATEWAY_ACCESS_LOGS_KEY, value: true },
  { atMs: SUNSET_TAKES_EFFECT_MS + 3_000, controlKey: INSPECT_SUPPORT_TICKET_QUEUE_KEY, value: true },
];

describe("API Version Sunset Breaks Silent Long-Tail Consumers", () => {
  it("carries real library metadata, is branching-structured, staff-level, and paid", () => {
    expect(apiVersionSunsetBreaksSilentConsumers.structure).toBe("branching");
    expect(apiVersionSunsetBreaksSilentConsumers.difficulty).toBe("staff");
    expect(apiVersionSunsetBreaksSilentConsumers.isFree).toBe(false);
    expect(apiVersionSunsetBreaksSilentConsumers.library?.category).toBe("Microservices & Dependencies");
    expect(apiVersionSunsetBreaksSilentConsumers.library?.primarySkill).toBeTruthy();
    expect(apiVersionSunsetBreaksSilentConsumers.library?.skills.length).toBeGreaterThan(0);
  });

  it("has version 1", () => {
    expect(apiVersionSunsetBreaksSilentConsumers.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), each tagged with a roleInIncident", () => {
    const metrics = apiVersionSunsetBreaksSilentConsumersCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("includes at least one root_cause and one downstream_symptom metric", () => {
    const metrics = apiVersionSunsetBreaksSilentConsumersCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
  });

  it("starts healthy with every signal at baseline", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.v1ErrorRate5xxPercent).toBe(0.2);
    expect(state.values.unregisteredV1CallerCount).toBe(2);
    expect(state.values.registeredV1ConsumerMigratedPercent).toBe(100);
  });

  it("breaks hard once the sunset takes effect, while the registry still reports 100% migrated — the misleading signal", () => {
    const state = runScenario(SUNSET_TAKES_EFFECT_MS + 1_000);
    expect(state.componentHealth["orders-api-v1"]).toBe("critical");
    expect(state.values.v1ErrorRate5xxPercent).toBeGreaterThan(20);
    expect(state.values.unregisteredV1CallerCount).toBeGreaterThan(30);
    // The registry claims every known consumer finished migrating —
    // true for registered consumers, and useless for diagnosing this.
    expect(state.values.registeredV1ConsumerMigratedPercent).toBe(100);
  });

  it("a noise signal (gateway TLS handshake failures) climbs during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const breaking = runScenario(SUNSET_TAKES_EFFECT_MS + 1_000);
    expect(breaking.values.gatewayTlsHandshakeFailureCount as number).toBeGreaterThan(
      healthy.values.gatewayTlsHandshakeFailureCount as number,
    );
    // Stays unchanged by a correct fix — proving it never factors into
    // successCondition/failureCondition/rules.
    const fixed = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
      ...FULL_INVESTIGATION,
      { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
      { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
    ]);
    expect(fixed.values.gatewayTlsHandshakeFailureCount).toBe(12);
  });

  describe("inferior and harmful remediation paths", () => {
    it("enabling the shim alone (no follow-through migration) mitigates most volume but leaves a real residual problem", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 5_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: ENABLE_COMPATIBILITY_SHIM_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("shim-only");
      expect(state.values.unregisteredV1CallerCount).toBeGreaterThan(5);
      expect(state.values.unregisteredV1CallerCount).toBeLessThan(46);
    });

    it("extending the deadline alone (no follow-through migration) buys time but fixes nothing yet", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 5_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("extend-only");
      expect(state.values.unregisteredV1CallerCount).toBeGreaterThan(30);
    });

    it("forcing the hard cutover makes the gateway's own error rate look healthy while the real problem keeps getting worse", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 5_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: FORCE_HARD_CUTOVER_KEY, value: true },
      ]);
      expect(state.componentHealth["api-gateway"]).toBe("healthy");
      expect(state.values.v1ErrorRate5xxPercent).toBeLessThan(1);
      expect(state.values.unregisteredV1CallerCount).toBeGreaterThanOrEqual(46);
      expect(state.values.supportTicketBacklogCount).toBeGreaterThan(58);
    });

    it("the hard cutover never satisfies successCondition despite the gateway-side error rate reading healthy", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: FORCE_HARD_CUTOVER_KEY, value: true },
      ]);
      expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).not.toBe("resolved");
    });
  });

  describe("the correct, branching remediation strategies", () => {
    it("extend-then-migrate, fully investigated first, reaches the correlated extend-then-migrated path", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-extend-then-migrated");
      expect(state.values.remediationStrategy).toBe("extend-then-migrated");
      expect(state.values.investigationQuality).toBe("correlated");
      expect(state.componentHealth["orders-api-v1"]).toBe("healthy");
      expect(state.componentHealth["consumer-registry"]).toBe("healthy");
    });

    it("shim-then-migrate, fully investigated first, reaches the correlated shim-then-migrated path — a different order, same investigation-quality credit", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        {
          atMs: SUNSET_TAKES_EFFECT_MS + 1_000,
          controlKey: INSPECT_SUPPORT_TICKET_QUEUE_KEY,
          value: true,
        },
        {
          atMs: SUNSET_TAKES_EFFECT_MS + 2_000,
          controlKey: INSPECT_GATEWAY_ACCESS_LOGS_KEY,
          value: true,
        },
        {
          atMs: SUNSET_TAKES_EFFECT_MS + 3_000,
          controlKey: INSPECT_CONSUMER_REGISTRY_KEY,
          value: true,
        },
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: ENABLE_COMPATIBILITY_SHIM_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-shim-then-migrated");
      expect(state.values.remediationStrategy).toBe("shim-then-migrated");
      expect(state.values.investigationQuality).toBe("correlated");
      expect(state.componentHealth["orders-api-v1"]).toBe("healthy");
    });

    it("either correct strategy applied without investigating first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 2_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-extend-then-migrated");
      expect(state.values.investigationQuality).toBe("guessed");
      expect(state.componentHealth["orders-api-v1"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires the unregistered caller count, failure rate, and ticket backlog all recovered together", () => {
    const state = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
      ...FULL_INVESTIGATION,
      { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
      { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after the support ticket backlog remains critical past the old sustained window", () => {
    const state = runScenario(SUNSET_TAKES_EFFECT_MS + 61_000, [
      { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: FORCE_HARD_CUTOVER_KEY, value: true },
    ]);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: INSPECT_GATEWAY_ACCESS_LOGS_KEY, value: true },
      { atMs: SUNSET_TAKES_EFFECT_MS + 2_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
      { atMs: SUNSET_TAKES_EFFECT_MS + 3_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
    ];
    const runA = runScenario(SUNSET_TAKES_EFFECT_MS + 10_000, actions);
    const runB = runScenario(SUNSET_TAKES_EFFECT_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(API_VERSION_SUNSET_BREAKS_SILENT_CONSUMERS_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      const guessed = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 2_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("the two correct investigated branches (extend-then-migrate vs. shim-then-migrate) score identically on dataIntegrity", () => {
      const extendBranch = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      const shimBranch = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: ENABLE_COMPATIBILITY_SHIM_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);

      expect(scoreOf(extendBranch).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(shimBranch).breakdown.dataIntegrity).toBe(200);
    });

    it("a candidate who forces the harmful hard-cutover scores lower than one who takes either correct branch", () => {
      const correlated = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      const hardCutover = runScenario(5 * 60_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: FORCE_HARD_CUTOVER_KEY, value: true },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(hardCutover).total);
    });

    it("the dataIntegrity dimension awards a lower band for a guessed fix than a fully investigated one", () => {
      const investigated = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);
      const guessed = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        { atMs: SUNSET_TAKES_EFFECT_MS + 1_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 2_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
      ]);

      expect(scoreOf(investigated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(SUNSET_TAKES_EFFECT_MS + 20_000, [
        ...FULL_INVESTIGATION,
        { atMs: SUNSET_TAKES_EFFECT_MS + 4_000, controlKey: EXTEND_SUNSET_DEADLINE_KEY, value: true },
        { atMs: SUNSET_TAKES_EFFECT_MS + 5_000, controlKey: MIGRATE_DISCOVERED_CONSUMERS_KEY, value: true },
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
      const totalMax = Object.values(result.maxPoints).reduce((sum, v) => sum + v, 0);
      expect(totalMax).toBe(1000);
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces unregistered caller count as the root cause and the error/ticket symptoms as observed effects", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 1_000);
      const narrative = buildIncidentNarrative(apiVersionSunsetBreaksSilentConsumersCandidateUI, state.values);

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Unregistered v1 Caller Count");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Orders API v1 5xx Error Rate", "Order Creation Failure Rate", "Support Ticket Backlog"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Registered Consumer Migration Rate"]),
      );
    });

    it("never surfaces the noise-tagged gateway TLS handshake failure count in any narrative group", () => {
      const state = runScenario(SUNSET_TAKES_EFFECT_MS + 1_000);
      const narrative = buildIncidentNarrative(apiVersionSunsetBreaksSilentConsumersCandidateUI, state.values);
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Gateway TLS Handshake Failures")).toBe(false);
    });
  });
});
