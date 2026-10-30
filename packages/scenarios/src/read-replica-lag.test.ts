import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { readReplicaLag } from "./read-replica-lag";
import {
  READ_ROUTING_MODE_KEY,
  readReplicaLagSimulation,
  REPLICATION_BATCH_SIZE_KEY,
  WRITE_THROTTLE_ENABLED_KEY,
} from "./read-replica-lag/definition";
import { READ_REPLICA_LAG_SCORING } from "./read-replica-lag/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(readReplicaLagSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += readReplicaLagSimulation.tickMs
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
      readReplicaLagSimulation,
      state,
      action,
      readReplicaLagSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Read Replica Lag", () => {
  it("carries real library metadata and is a paid scenario", () => {
    expect(readReplicaLag.isFree).toBe(false);
    expect(readReplicaLag.library?.category).toBe("Databases & Storage");
    expect(readReplicaLag.library?.tags.length).toBeGreaterThan(0);
    expect(readReplicaLag.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(readReplicaLagSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.replicationLagMs).toBe(80);
    expect(state.values.replicaStatus).toBe("normal");
  });

  it("lags critically when a write burst hits with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.replicationLagMs).toBe(8_000);
    expect(state.values.replicaStatus).toBe("critical");
  });

  it("recovers when reads are routed to the primary for recent writes", () => {
    const state = runScenario(55_000, [
      {
        atMs: 31_000,
        controlKey: READ_ROUTING_MODE_KEY,
        value: "primary-for-recent-writes",
      },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.replicationLagMs).toBe(120);
    expect(evaluateCandidateDeclaredFinish(readReplicaLagSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("routing everything to the primary is harmful, not helpful", () => {
    const baseline = runScenario(35_000);
    const withAlwaysPrimary = runScenario(35_000, [
      { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
    ]);

    expect(withAlwaysPrimary.values.writeLatencyMs).toBeGreaterThan(
      baseline.values.writeLatencyMs as number,
    );
    expect(withAlwaysPrimary.values.replicaStatus).toBe("critical");
  });

  it("routing everything to the primary and throttling writes masks the symptom at a throughput cost", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
      { atMs: 31_000, controlKey: WRITE_THROTTLE_ENABLED_KEY, value: true },
    ]);

    expect(state.values.replicaStatus).toBe("warning");
    expect(state.values.replicationLagMs).toBe(4_000);
  });

  it("a smaller replication batch size alone only partially helps", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: REPLICATION_BATCH_SIZE_KEY, value: "small" },
    ]);

    expect(state.values.replicaStatus).toBe("warning");
    expect(state.values.replicationLagMs).toBe(2_200);
  });

  it("stays active (never auto-fails) even after lag remains critical past the old sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(60);
  });

  it("tracks peak replication lag generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.replicationLagMs).toBe(8_000);
  });

  describe("scoring orders good recovery above baseline/partial, which beat the harmful traps", () => {
    // The engine itself never auto-writes resolvedAtMs (Phase 7.1
    // doctrine) — score a genuinely-resolvable run via its Finish
    // declaration; every other (unresolved/failed) run still scores
    // correctly via a raw extractScoringInputs call.
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(readReplicaLagSimulation, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(readReplicaLagSimulation, finishResult)
          : extractScoringInputs(readReplicaLagSimulation, state);
      return scoreAuthoredAttempt(READ_REPLICA_LAG_SCORING, inputs);
    }

    const FAIL_WINDOW_MS = 30_000 + 61_000;

    it("good recovery scores the maximum", () => {
      const good = runScenario(55_000, [
        {
          atMs: 31_000,
          controlKey: READ_ROUTING_MODE_KEY,
          value: "primary-for-recent-writes",
        },
      ]);

      expect(good.status).not.toBe("resolved");
      expect(evaluateCandidateDeclaredFinish(readReplicaLagSimulation, good).outcome).toBe(
        "resolved",
      );

      const baseline = runScenario(FAIL_WINDOW_MS);
      const harmful = runScenario(FAIL_WINDOW_MS, [
        { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
      ]);
      const partial = runScenario(FAIL_WINDOW_MS, [
        { atMs: 31_000, controlKey: REPLICATION_BATCH_SIZE_KEY, value: "small" },
      ]);

      const goodScore = scoreOf(good).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;
      const partialScore = scoreOf(partial).total;

      // primary-for-recent-writes is the only rule that drives
      // replicationLagMs (120ms) and staleReadRate (0.6) below the
      // successCondition thresholds (<=500ms, <2) and sustains them for
      // 15s, so it is the only sequence that actually resolves.
      expect(goodScore).toBeGreaterThan(baselineScore);
      expect(goodScore).toBeGreaterThan(harmfulScore);
      expect(goodScore).toBeGreaterThan(partialScore);
    });

    it("the always-primary harmful trap scores worse than doing nothing, via the harmfulChangeCount penalty", () => {
      // lag-critical-default (baseline, no action) and always-primary-harmful
      // both land in the "unresolved-at-scoring-time" bucket here: neither
      // the engine's removed sustained-breach trigger nor any other
      // mechanism ever auto-fails these runs (the engine's only remaining
      // automatic-failure trigger is the uniform attempt-ceiling, far past
      // this window) — baseline stays critical with replicationLagMs=8_000
      // sustained well past the old 60s window, and always-primary-harmful
      // likewise stays critical, since routing every read AND write to the
      // primary during the burst pushes replicationLagMs to 9_500ms (still
      // >= the 7_000ms failureCondition threshold, just no longer
      // terminal). Both null-failedAtMs cases hit the scorer's
      // terminalOverrides: { unresolved: 0 } for recovery and reliability
      // alike, and revenueLossUsd/customerImpact never climbs out of the
      // scoring config's top <=5000 band in this short window for either
      // (baseline's 350/min and harmful's 550/min revenueLossRatePerMinute
      // both stay well under 5_000usd over ~58s of critical time) — so the
      // only dimension that actually distinguishes them is
      // operationalEfficiency: action-classifications.ts marks
      // always-primary (with writeBurstActive true) "harmful", baseline
      // takes no action at all, and the scoring config's
      // harmfulChangeCount >= 1 penalty subtracts 15 points from harmful's
      // operationalEfficiency (50 -> 35) that baseline keeps in full.
      const baseline = runScenario(FAIL_WINDOW_MS);
      const harmful = runScenario(FAIL_WINDOW_MS, [
        { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
      ]);

      expect(baseline.status).not.toBe("failed");
      expect(baseline.failedAtMs).toBeNull();
      expect(harmful.status).not.toBe("failed");
      expect(harmful.failedAtMs).toBeNull();
      expect(harmful.numberOfHarmfulChanges).toBeGreaterThan(
        baseline.numberOfHarmfulChanges,
      );

      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });

    it("the small-batch partial never resolves but is not penalized as a harmful change, scoring level with baseline", () => {
      // small-batch-partial sets replicationLagMs to 2_200ms — below the
      // 7_000ms failureCondition threshold, so it never fails outright, but
      // also above the successCondition's <=500ms threshold, so it never
      // resolves either: a genuine permanent "degraded" dead-end distinct
      // from both the good-recovery and harmful/baseline states. Because
      // REPLICATION_BATCH_SIZE_KEY="small" during a write burst carries no
      // action-classifications.ts entry (only "large" is classified
      // harmful there), this sequence contributes zero harmful changes, so
      // it keeps the full operationalEfficiency score baseline also gets,
      // landing it level with (not above or below) the no-action baseline.
      const baseline = runScenario(FAIL_WINDOW_MS);
      const partial = runScenario(FAIL_WINDOW_MS, [
        { atMs: 31_000, controlKey: REPLICATION_BATCH_SIZE_KEY, value: "small" },
      ]);

      expect(partial.status).toBe("degraded");
      expect(partial.resolvedAtMs).toBeNull();
      expect(partial.failedAtMs).toBeNull();
      expect(partial.numberOfHarmfulChanges).toBe(0);

      const baselineScore = scoreOf(baseline).total;
      const partialScore = scoreOf(partial).total;

      expect(partialScore).toBe(baselineScore);
    });

    it("the masked-lag trap (always-primary + write throttling) scores the same as the unthrottled harmful trap", () => {
      // throttled-primary-masked also never resolves (staleReadRate 0.1 is
      // fine, but replicationLagMs=4_000 still exceeds the 500ms success
      // threshold) and never fails (4_000ms stays under the 7_000ms failure
      // threshold) -- another permanent "degraded" dead-end. It carries
      // exactly one harmful change (always-primary, same as the unthrottled
      // trap; writeThrottleEnabled=true is classified "neutral" in
      // action-classifications.ts, not an additional harmful mark), so the
      // harmfulChangeCount>=1 penalty (-15) lands identically to the
      // unthrottled always-primary-harmful trap, even though the two traps
      // reach different incidentStates and different revenueLossUsd
      // totals.
      const harmful = runScenario(FAIL_WINDOW_MS, [
        { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
      ]);
      const masked = runScenario(FAIL_WINDOW_MS, [
        { atMs: 31_000, controlKey: READ_ROUTING_MODE_KEY, value: "always-primary" },
        { atMs: 31_000, controlKey: WRITE_THROTTLE_ENABLED_KEY, value: true },
      ]);

      expect(masked.status).toBe("degraded");
      expect(masked.numberOfHarmfulChanges).toBe(harmful.numberOfHarmfulChanges);

      const harmfulScore = scoreOf(harmful).total;
      const maskedScore = scoreOf(masked).total;

      expect(maskedScore).toBe(harmfulScore);
    });
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      {
        atMs: 31_000,
        controlKey: READ_ROUTING_MODE_KEY,
        value: "primary-for-recent-writes",
      },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });
});
