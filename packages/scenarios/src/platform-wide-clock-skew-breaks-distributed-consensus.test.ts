import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { platformWideClockSkewBreaksDistributedConsensus } from "./platform-wide-clock-skew-breaks-distributed-consensus";
import {
  platformWideClockSkewBreaksDistributedConsensusSimulation,
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
  FORCE_LEADER_REELECTION_KEY,
  RESTART_LOCK_SERVICE_KEY,
  RESTART_LEDGER_SERVICE_KEY,
  RESTART_RATE_LIMITER_KEY,
} from "./platform-wide-clock-skew-breaks-distributed-consensus/definition";
import { PLATFORM_WIDE_CLOCK_SKEW_BREAKS_DISTRIBUTED_CONSENSUS_SCORING } from "./platform-wide-clock-skew-breaks-distributed-consensus/scoring";
import { platformWideClockSkewBreaksDistributedConsensusCandidateUI } from "./platform-wide-clock-skew-breaks-distributed-consensus/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = platformWideClockSkewBreaksDistributedConsensusSimulation;
const SKEW_BEGINS_MS = 30_000;

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

describe("Platform-Wide Clock Skew Breaks Distributed Consensus — causal unification incident", () => {
  it("carries real library metadata, is cascading-structured, principal-level, and paid", () => {
    expect(platformWideClockSkewBreaksDistributedConsensus.structure).toBe("cascading");
    expect(platformWideClockSkewBreaksDistributedConsensus.difficulty).toBe("principal");
    expect(platformWideClockSkewBreaksDistributedConsensus.isFree).toBe(false);
    expect(platformWideClockSkewBreaksDistributedConsensus.library?.category).toBe(
      "Distributed Systems",
    );
    expect(platformWideClockSkewBreaksDistributedConsensus.library?.primarySkill).toBeTruthy();
    expect(platformWideClockSkewBreaksDistributedConsensus.library?.skills.length).toBeGreaterThan(0);
    expect(platformWideClockSkewBreaksDistributedConsensus.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has no direct edge between the three affected subsystems — only a shared upstream ancestor", () => {
    const edgeKeys = new Set(SIM.architecture.edges.map((e) => `${e.from}->${e.to}`));
    expect(edgeKeys.has("lock-service->ledger-service")).toBe(false);
    expect(edgeKeys.has("ledger-service->rate-limiter")).toBe(false);
    expect(edgeKeys.has("lock-service->rate-limiter")).toBe(false);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = platformWideClockSkewBreaksDistributedConsensusCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with all three subsystems normal and clocks in sync", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.fleetClockSkewMs).toBe(12);
    expect(state.values.lockServiceSplitBrainCount).toBe(0);
    expect(state.values.ledgerOutOfOrderWriteRatePercent).toBe(0.1);
    expect(state.values.rateLimiterFalseThrottleRatePercent).toBe(0.2);
  });

  it("all three independent subsystems degrade simultaneously once clock skew begins", () => {
    const state = runScenario(SKEW_BEGINS_MS + 1_000);
    expect(state.componentHealth["lock-service"]).toBe("critical");
    expect(state.componentHealth["ledger-service"]).toBe("critical");
    expect(state.componentHealth["rate-limiter"]).toBe("critical");
    expect(state.values.lockServiceSplitBrainCount as number).toBeGreaterThan(0);
    expect(state.values.ledgerOutOfOrderWriteRatePercent as number).toBeGreaterThan(1);
    expect(state.values.rateLimiterFalseThrottleRatePercent as number).toBeGreaterThan(1);
  });

  it("a noise signal (API request volume) shifts during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const skewed = runScenario(SKEW_BEGINS_MS + 1_000);
    expect(skewed.values.apiRequestVolumePerSecond as number).not.toBe(
      healthy.values.apiRequestVolumePerSecond as number,
    );
    // Request volume stays roughly unchanged by the correct fix — proving
    // it never factored into successCondition/failureCondition/rules.
    const fixed = runScenario(SKEW_BEGINS_MS + 20_000, [
      { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
      { atMs: SKEW_BEGINS_MS + 2_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
    ]);
    expect(fixed.values.apiRequestVolumePerSecond).toBe(4_150);
  });

  describe("inferior single-subsystem restart paths", () => {
    it("restarting the lock service alone is plausible but insufficient — ledger and rate-limiter stay broken", () => {
      const state = runScenario(SKEW_BEGINS_MS + 5_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESTART_LOCK_SERVICE_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-lock-service-only");
      expect(state.componentHealth["ledger-service"]).toBe("critical");
      expect(state.componentHealth["rate-limiter"]).toBe("critical");
      expect(state.values.fleetClockSkewMs as number).toBeGreaterThan(500);
    });

    it("restarting the ledger service alone is plausible but insufficient — lock service and rate-limiter stay broken", () => {
      const state = runScenario(SKEW_BEGINS_MS + 5_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESTART_LEDGER_SERVICE_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-ledger-service-only");
      expect(state.componentHealth["lock-service"]).toBe("critical");
      expect(state.componentHealth["rate-limiter"]).toBe("critical");
    });

    it("restarting the rate limiter alone is plausible but insufficient — lock service and ledger stay broken", () => {
      const state = runScenario(SKEW_BEGINS_MS + 5_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESTART_RATE_LIMITER_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-rate-limiter-only");
      expect(state.componentHealth["lock-service"]).toBe("critical");
      expect(state.componentHealth["ledger-service"]).toBe("critical");
    });
  });

  it("resyncing clocks without forcing leader re-election leaves the lock service wedged but recovers the other two", () => {
    const state = runScenario(SKEW_BEGINS_MS + 5_000, [
      { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
    ]);
    expect(state.values.diagnosisPath).toBe("resynced-without-reelection");
    expect(state.values.lockServiceSplitBrainCount as number).toBeGreaterThan(0);
    expect(state.values.ledgerOutOfOrderWriteRatePercent as number).toBeLessThan(1);
    expect(state.values.rateLimiterFalseThrottleRatePercent as number).toBeLessThan(1);
  });

  describe("the correct, unified fix — order independence", () => {
    it("investigating NTP, lock service, ledger, and rate limiter, then resyncing and re-electing — reaches the unified path", () => {
      const state = runScenario(SKEW_BEGINS_MS + 20_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 3_000, controlKey: INSPECT_LEDGER_ORDERING_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 4_000, controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("unified-then-fixed");
      expect(state.componentHealth["lock-service"]).toBe("healthy");
      expect(state.componentHealth["ledger-service"]).toBe("healthy");
      expect(state.componentHealth["rate-limiter"]).toBe("healthy");
    });

    it("investigating in a different order (rate limiter first, NTP last) still reaches the unified path", () => {
      const state = runScenario(SKEW_BEGINS_MS + 20_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: INSPECT_LEDGER_ORDERING_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 3_000, controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 4_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("unified-then-fixed");
    });

    it("resyncing and re-electing without investigating anything first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(SKEW_BEGINS_MS + 20_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["lock-service"]).toBe("healthy");
      expect(state.componentHealth["ledger-service"]).toBe("healthy");
      expect(state.componentHealth["rate-limiter"]).toBe("healthy");
    });
  });

  it("the cascade widens further if clock skew goes unresynced long enough", () => {
    const state = runScenario(150_000 + 1_000);
    expect(state.values.fleetClockSkewMs as number).toBeGreaterThan(2_000);
    expect(state.componentHealth["fleet-nodes"]).toBe("degraded");
  });

  it("verification: successCondition requires split-brain cleared, ordering/throttling restored, and clocks resynced together", () => {
    const state = runScenario(SKEW_BEGINS_MS + 20_000, [
      { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
      { atMs: SKEW_BEGINS_MS + 2_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after fleet clock skew remains critical past the old sustained window", () => {
    const state = runScenario(SKEW_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
      { atMs: SKEW_BEGINS_MS + 2_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
      { atMs: SKEW_BEGINS_MS + 3_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
    ];
    const runA = runScenario(SKEW_BEGINS_MS + 10_000, actions);
    const runB = runScenario(SKEW_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(PLATFORM_WIDE_CLOCK_SKEW_BREAKS_DISTRIBUTED_CONSENSUS_SCORING, inputs);
    }

    it("a candidate who unifies the diagnosis before fixing scores strictly higher than one who guesses the same fix", () => {
      const unified = runScenario(SKEW_BEGINS_MS + 26_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 3_000, controlKey: INSPECT_LEDGER_ORDERING_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 4_000, controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      const guessed = runScenario(SKEW_BEGINS_MS + 20_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);

      expect(scoreOf(unified).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("a candidate who randomly chases single-subsystem restarts scores lower than one who takes the unified strong path", () => {
      const unified = runScenario(SKEW_BEGINS_MS + 26_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 3_000, controlKey: INSPECT_LEDGER_ORDERING_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 4_000, controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESTART_LOCK_SERVICE_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 30_000, controlKey: RESTART_LEDGER_SERVICE_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 60_000, controlKey: RESTART_RATE_LIMITER_KEY, value: true },
      ]);

      expect(scoreOf(unified).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the unified-then-fixed diagnosisPath", () => {
      const unified = runScenario(SKEW_BEGINS_MS + 26_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: INSPECT_NTP_SYNC_STATUS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 3_000, controlKey: INSPECT_LEDGER_ORDERING_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 4_000, controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      const guessed = runScenario(SKEW_BEGINS_MS + 20_000, [
        { atMs: SKEW_BEGINS_MS + 1_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 2_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);

      expect(scoreOf(unified).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(70);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const unified = runScenario(SKEW_BEGINS_MS + 20_000, [
        { atMs: SKEW_BEGINS_MS + 5_000, controlKey: RESYNC_FLEET_CLOCKS_KEY, value: true },
        { atMs: SKEW_BEGINS_MS + 6_000, controlKey: FORCE_LEADER_REELECTION_KEY, value: true },
      ]);
      const result = scoreOf(unified);

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
    it("surfaces NTP sync offset as the root cause and all three subsystems as observed effects/contributing factors", () => {
      const state = runScenario(SKEW_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        platformWideClockSkewBreaksDistributedConsensusCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("NTP Sync Offset");
      expect(narrative.contributingFactors.map((e) => e.label)).toContain("Fleet Clock Skew");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining([
          "Lock Service Split-Brain Count",
          "Ledger Out-of-Order Write Rate",
          "Rate Limiter False-Throttle Rate",
        ]),
      );
    });

    it("never surfaces the noise-tagged API request volume in any narrative group", () => {
      const state = runScenario(SKEW_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        platformWideClockSkewBreaksDistributedConsensusCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "API Request Volume")).toBe(false);
    });
  });
});
