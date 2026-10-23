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
import { scoreAuthoredAttempt } from "./authoring/score";
import { consumerRebalanceStorm } from "./consumer-rebalance-storm";
import {
  consumerRebalanceStormSimulation,
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
} from "./consumer-rebalance-storm/definition";
import { CONSUMER_REBALANCE_STORM_SCORING } from "./consumer-rebalance-storm/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(consumerRebalanceStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += consumerRebalanceStormSimulation.tickMs
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
      consumerRebalanceStormSimulation,
      state,
      action,
      consumerRebalanceStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Consumer Rebalance Storm", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(consumerRebalanceStorm.isFree).toBe(false);
    expect(consumerRebalanceStorm.library?.category).toBe("Messaging & Streaming");
    expect(consumerRebalanceStorm.library?.tags.length).toBeGreaterThan(0);
    expect(consumerRebalanceStorm.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(consumerRebalanceStormSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.rebalanceCount).toBe(0);
    expect(state.values.groupStatus).toBe("normal");
  });

  it("enters a rebalance storm when the rolling deploy begins with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.effectiveThroughput).toBe(900);
    expect(state.values.groupStatus).toBe("critical");
  });

  it("reaches a sustained healthy state when static group membership is enabled (Phase 6.1: candidate_declared, never auto-resolves)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.resolvedAtMs).toBeNull();
    expect(state.values.effectiveThroughput).toBe(3_900);
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      consumerRebalanceStormSimulation.successCondition.sustainedSeconds,
    );
  });

  it("shortening the session timeout during a one-at-a-time deploy is harmful, not helpful", () => {
    const baseline = runScenario(35_000);
    const withShortTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: SESSION_TIMEOUT_MS_KEY, value: 6_000 },
    ]);

    expect(withShortTimeout.values.rebalanceCount as number).toBeGreaterThan(
      baseline.values.rebalanceCount as number,
    );
    expect(withShortTimeout.values.effectiveThroughput as number).toBeLessThan(
      baseline.values.effectiveThroughput as number,
    );
    expect(withShortTimeout.values.groupStatus).toBe("critical");
  });

  it("static group membership dominates over a short timeout (recovery, not the trap)", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: SESSION_TIMEOUT_MS_KEY, value: 6_000 },
      { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.groupStatus).toBe("normal");
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      consumerRebalanceStormSimulation.successCondition.sustainedSeconds,
    );
  });

  it("a non-rolling deploy strategy alone is a partial, not full, improvement", () => {
    const blueGreen = runScenario(35_000, [
      { atMs: 31_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
    ]);

    expect(blueGreen.values.groupStatus).toBe("warning");
    expect(blueGreen.values.effectiveThroughput).toBe(3_200);
  });

  describe("Phase 6.1: acceptableCondition — blue-green's genuine ordering tradeoff is a legitimate acceptable tier, distinct from a weaker partial", () => {
    it("blue-green alone, sustained, is eligible for an acceptable-tier Finish (throughput/status healthy, stableTimeRatio short of optimal)", () => {
      const state = runScenario(50_000, [
        { atMs: 31_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.values.groupStableTimeRatio).toBeLessThan(90);
      const eligibility = evaluateCompletionEligibility(consumerRebalanceStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("the weaker rolling-batched tradeoff, sustained, is NOT eligible for any Finish tier (throughput still short of the acceptable bar too)", () => {
      const state = runScenario(50_000, [
        { atMs: 31_000, controlKey: DEPLOY_STRATEGY_KEY, value: "rolling-batched" },
      ]);

      expect(state.status).not.toBe("resolved");
      expect(state.values.effectiveThroughput).toBe(2_600);
      const eligibility = evaluateCompletionEligibility(consumerRebalanceStormSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  it("escalates when the health check also starts flapping", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.groupStatus).toBe("critical");
    expect(state.values.rebalanceCount).toBe(38);
  });

  it("fails if effective throughput stays critically low for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak rebalance count generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.rebalanceCount).toBe(24);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring orders good >= acceptable-tier partial > baseline > harmful", () => {
    // Consumer Rebalance Storm is candidate_declared (Phase 6.1): the
    // engine never auto-writes resolvedAtMs, so score via the same
    // Finish-equivalent derivation finishAttempt uses for a genuinely
    // stabilized state (good/acceptable-tier partial), never a raw
    // extractScoringInputs call, which would incorrectly score them as
    // "unresolved".
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(consumerRebalanceStormSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(consumerRebalanceStormSimulation, finishResult)
          : extractScoringInputs(consumerRebalanceStormSimulation, state);
      return scoreAuthoredAttempt(CONSUMER_REBALANCE_STORM_SCORING, inputs);
    }

    it("orders good >= acceptableTierPartial > baseline > harmful", () => {
      // Good: static group membership lets a restarted consumer rejoin
      // its prior assignment without a full rebalance at all
      // ("static-membership-non-one-at-a-time-recovery" in rules.ts) —
      // groupStableTimeRatio 97 >= 90, effectiveThroughput 3,900 >=
      // 3,000, groupStatus "normal" != "critical": full optimal-tier
      // successCondition.
      const good = runScenario(50_000, [
        { atMs: 31_000, controlKey: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY, value: true },
      ]);

      // Acceptable-tier partial: blue-green deploy strategy alone
      // ("blue-green-deploy-strategy-only") — effectiveThroughput 3,200
      // >= 3,000 and groupStatus "warning" != "critical" satisfy
      // acceptableCondition, but groupStableTimeRatio 85 < 90 falls short
      // of successCondition's optimal bar.
      const acceptableTierPartial = runScenario(50_000, [
        { atMs: 31_000, controlKey: DEPLOY_STRATEGY_KEY, value: "blue-green" },
      ]);

      // Baseline: no action, rolling one-at-a-time deploy with default
      // controls ("rebalance-storm-default") — effectiveThroughput 900
      // stays <= 1,000 for the full 60s sustained window, so the
      // automatic failureCondition fires.
      const baseline = runScenario(30_000 + 61_000);

      // Harmful: shortening the session timeout during the one-at-a-time
      // deploy ("short-timeout-harmful") — the coordinator declares
      // consumers dead on even shorter jitter, triggering MORE
      // rebalances (42 vs. 24) and driving effectiveThroughput down to
      // 400, well below baseline's 900, so it fails faster/harder too.
      const harmful = runScenario(30_000 + 61_000, [
        { atMs: 31_000, controlKey: SESSION_TIMEOUT_MS_KEY, value: 6_000 },
      ]);

      expect(good.status).not.toBe("resolved");
      expect(good.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        consumerRebalanceStormSimulation.successCondition.sustainedSeconds,
      );
      const acceptableEligibility = evaluateCompletionEligibility(
        consumerRebalanceStormSimulation,
        acceptableTierPartial,
      );
      expect(acceptableEligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(baseline.status).toBe("failed");
      expect(harmful.status).toBe("failed");
      expect(harmful.values.rebalanceCount as number).toBeGreaterThan(
        baseline.values.rebalanceCount as number,
      );

      const goodScore = scoreOf(good).total;
      const acceptableScore = scoreOf(acceptableTierPartial).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      // Both the optimal and acceptable Finish tiers stabilize at the
      // same atMs (31s, 1s into the incident), so recovery's
      // recoveryTimeSeconds band and reliability's criticalTimeRatio
      // band (both derived from timing before the action landed, not
      // from which tier was reached) land identically for both — a
      // genuine tie in this scoring config, not an assertion of
      // universal good > partial. Both strictly outscore the baseline,
      // which in turn outscores the harmful trap.
      expect(goodScore).toBeGreaterThanOrEqual(acceptableScore);
      expect(acceptableScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });
  });
});
