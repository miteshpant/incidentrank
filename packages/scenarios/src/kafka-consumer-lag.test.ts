import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { kafkaConsumerLag } from "./kafka-consumer-lag";
import {
  AUTO_COMMIT_ENABLED_KEY,
  CONSUMER_INSTANCES_KEY,
  kafkaConsumerLagSimulation,
  MAX_POLL_RECORDS_KEY,
} from "./kafka-consumer-lag/definition";
import { KAFKA_CONSUMER_LAG_SCORING } from "./kafka-consumer-lag/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(kafkaConsumerLagSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += kafkaConsumerLagSimulation.tickMs
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
      kafkaConsumerLagSimulation,
      state,
      action,
      kafkaConsumerLagSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Kafka Consumer Lag", () => {
  it("carries real library metadata and is one of the 3 free launch scenarios", () => {
    expect(kafkaConsumerLag.isFree).toBe(true);
    expect(kafkaConsumerLag.library?.category).toBe("Messaging & Streaming");
    expect(kafkaConsumerLag.library?.tags.length).toBeGreaterThan(0);
    expect(kafkaConsumerLag.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(kafkaConsumerLagSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.consumerLagMessages).toBe(200);
    expect(state.values.consumerStatus).toBe("normal");
  });

  it("lags critically when the producer spikes with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.consumerLagMessages).toBe(8_000);
    expect(state.values.consumerStatus).toBe("critical");
  });

  it("recovers when consumer instances are scaled up with auto-commit off", () => {
    const state = runScenario(55_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.consumerLagMessages).toBe(150);
    expect(evaluateCandidateDeclaredFinish(kafkaConsumerLagSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("raising maxPollRecords once slow records appear is harmful, not helpful, even with many consumers", () => {
    const stateWithoutMitigation = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
    ]);
    expect(stateWithoutMitigation.status).not.toBe("resolved");
    expect(
      evaluateCandidateDeclaredFinish(kafkaConsumerLagSimulation, stateWithoutMitigation)
        .outcome,
    ).toBe("resolved");

    const stateWithHarmfulBatch = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      { atMs: 5 * 60_000 + 1_000, controlKey: MAX_POLL_RECORDS_KEY, value: 5_000 },
    ]);

    expect(stateWithHarmfulBatch.values.consumerLagMessages).toBeGreaterThan(
      stateWithoutMitigation.values.consumerLagMessages as number,
    );
    expect(stateWithHarmfulBatch.values.consumerStatus).toBe("critical");
  });

  it("scaling without disabling auto-commit drains lag but accrues dead-letter risk", () => {
    const state = runScenario(55_000, [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      { atMs: 31_000, controlKey: AUTO_COMMIT_ENABLED_KEY, value: true },
    ]);

    expect(state.values.consumerLagMessages).toBe(300);
    expect(state.values.deadLetterCount).toBe(25);
    expect(state.values.consumerStatus).toBe("warning");
  });

  it("fails if lag stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak consumer lag generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.consumerLagMessages).toBe(8_000);
  });

  it("tracks monthly infrastructure cost that increases with consumer instances", () => {
    let state = createInitialState(kafkaConsumerLagSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(150);

    const tickMs = kafkaConsumerLagSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-consumers",
      timestampMs: 0,
      controlKey: CONSUMER_INSTANCES_KEY,
      value: 16,
    };
    state = simulate(kafkaConsumerLagSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(650);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 },
      { atMs: 31_000, controlKey: AUTO_COMMIT_ENABLED_KEY, value: false },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring orders good > baseline > harmful > partiallyScaled > unsafeCommitPartial", () => {
    // The engine itself never auto-writes resolvedAtMs (Phase 7.1
    // doctrine) — score the genuinely-resolvable good path via its
    // Finish declaration; every other (unresolved/failed) path still
    // scores correctly via a raw extractScoringInputs call.
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(kafkaConsumerLagSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(kafkaConsumerLagSimulation, finishResult)
          : extractScoringInputs(kafkaConsumerLagSimulation, state);
      return scoreAuthoredAttempt(KAFKA_CONSUMER_LAG_SCORING, inputs);
    }

    it("orders good > baseline > harmful > partiallyScaled > unsafeCommitPartial", () => {
      // Good: rules.ts's "scaled-consumers-safe-commit" — enough
      // consumers (>=8) with auto-commit off reaches
      // revenue-and-cost.ts's successCondition (lag <=300, errorRate <1,
      // status != critical) and sustains it long enough to auto-resolve.
      const good = runScenario(55_000, [
        { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 8 },
        { atMs: 31_000, controlKey: AUTO_COMMIT_ENABLED_KEY, value: false },
      ]);
      expect(good.status).not.toBe("resolved");
      expect(evaluateCandidateDeclaredFinish(kafkaConsumerLagSimulation, good).outcome).toBe(
        "resolved",
      );

      // Partial: rules.ts's "partially-scaled" — some scaling (4
      // instances) but not enough to fully absorb the spike; a genuine
      // distinct degraded incidentState (lag 2_200, errorRate 3), never
      // resolves within this window.
      const partiallyScaled = runScenario(5 * 60_000, [
        { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 4 },
      ]);
      expect(partiallyScaled.status).not.toBe("resolved");
      expect(partiallyScaled.status).not.toBe("failed");

      // Partial (data-integrity risk): rules.ts's
      // "scaled-consumers-unsafe-commit" — enough consumers to drain lag
      // (lag 300) but auto-commit stays on, so it narrowly misses
      // successCondition's lag<=300 AND errorRate<1 combination (errorRate
      // is 2, not <1) and instead accrues dead-letter risk.
      const unsafeCommitPartial = runScenario(5 * 60_000, [
        { atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 8 },
        { atMs: 31_000, controlKey: AUTO_COMMIT_ENABLED_KEY, value: true },
      ]);
      expect(unsafeCommitPartial.status).not.toBe("resolved");
      expect(unsafeCommitPartial.values.deadLetterCount).toBe(25);

      // Baseline: no mitigation at all — rules.ts's "lag-critical-default"
      // (lag 8_000, errorRate 12) sustains past failureCondition's 60s
      // window at lag>=7_500 and auto-fails.
      const baseline = runScenario(30_000 + 61_000);
      expect(baseline.status).toBe("failed");

      // Harmful: action-classifications.ts explicitly marks
      // maxPollRecords>=5000 while slowRecordsPresent as "harmful", and
      // rules.ts's "large-batches-with-slow-records-harmful" confirms why
      // — raising the poll batch size once slow records are present (at
      // the 5-minute mark) causes poll-timeout rebalances (lag 9_500,
      // errorRate 18). Deliberately never scales consumers up first (the
      // "raising maxPollRecords..." test above does, to prove the trap
      // dominates regardless of parallelism) so this run's recovery/
      // reliability dimensions are not contaminated by an earlier
      // unrelated resolution.
      const harmful = runScenario(5 * 60_000 + 10_000, [
        { atMs: 5 * 60_000 + 1_000, controlKey: MAX_POLL_RECORDS_KEY, value: 5_000 },
      ]);
      expect(harmful.values.consumerStatus).toBe("critical");

      // All four non-"good" runs share the same recovery=0/reliability=0
      // terminal overrides (none of them resolve within their window), and
      // the same customerImpact=200/dataIntegrity=200 (customerImpact's
      // bands and dataIntegrity's single catch-all band both saturate for
      // every run here, per scoring.ts). That leaves costEfficiency and
      // operationalEfficiency as the only dimensions that actually vary —
      // and they produce a genuinely counter-intuitive real ordering:
      // scaling consumerInstances raises finalMonthlyInfrastructureCostUsd
      // (infrastructureCost's perUnitMonthlyUsd table in
      // revenue-and-cost.ts), which costEfficiency's costIncreaseRatio
      // measure penalizes relative to the baselineMonthlyUsd — and that
      // penalty is not offset by any effectiveness credit unless the
      // scaling actually resolves the incident. So:
      //   - baseline (550) keeps consumerInstances at its initial value
      //     (no cost increase -> costEfficiency 100) and makes zero
      //     configuration changes (operationalEfficiency 50).
      //   - harmful (535) also never scales consumerInstances (same
      //     costEfficiency 100) but makes one harmfulChangeCount-flagged
      //     change (maxPollRecords>=5000 while slowRecordsPresent, per
      //     action-classifications.ts) -> operationalEfficiency's
      //     harmfulChangeCount>=1 penalty knocks 50 down to 35.
      //   - partiallyScaled (515) scales to 4 instances, which is a real
      //     monthly cost increase (perUnitMonthlyUsd[...:4] = 80) that
      //     drops costEfficiency to 65, outweighing its clean
      //     operationalEfficiency (50, since scaling to 4 isn't flagged
      //     beneficial OR harmful by action-classifications.ts's
      //     valueAtLeast:8 beneficial rule).
      //   - unsafeCommitPartial (500) scales to 8 (same costEfficiency 65
      //     as partiallyScaled) AND additionally sets autoCommitEnabled to
      //     true, which action-classifications.ts flags harmful while
      //     producerSpiking -> operationalEfficiency drops further to 35.
      // Net effect: this scenario's cost/efficiency tuning means a
      // candidate who scales consumers but fails to fully resolve the
      // incident (partiallyScaled, unsafeCommitPartial) scores WORSE than
      // one who does nothing (baseline) or even one who falls into the
      // maxPollRecords trap (harmful) without touching consumerInstances
      // at all — because unresolved partial scaling buys cost penalties
      // with no recovery credit to offset them. This is a real, verified
      // property of KAFKA_CONSUMER_LAG_SCORING as authored today, not an
      // assumed universal good>partial>baseline>harmful pattern.
      const goodScore = scoreOf(good).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;
      const partiallyScaledScore = scoreOf(partiallyScaled).total;
      const unsafeCommitScore = scoreOf(unsafeCommitPartial).total;

      expect(goodScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
      expect(harmfulScore).toBeGreaterThan(partiallyScaledScore);
      expect(partiallyScaledScore).toBeGreaterThan(unsafeCommitScore);
    });
  });
});
