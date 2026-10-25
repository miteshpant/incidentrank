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
import { databaseLockContention } from "./database-lock-contention";
import {
  BATCH_JOB_CHUNK_SIZE_KEY,
  BATCH_JOB_CONCURRENCY_KEY,
  databaseLockContentionSimulation,
  LOCK_TIMEOUT_MS_KEY,
} from "./database-lock-contention/definition";
import { DATABASE_LOCK_CONTENTION_SCORING } from "./database-lock-contention/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(databaseLockContentionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += databaseLockContentionSimulation.tickMs
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
      databaseLockContentionSimulation,
      state,
      action,
      databaseLockContentionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Database Lock Contention", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(databaseLockContention.isFree).toBe(false);
    expect(databaseLockContention.library?.category).toBe("Databases & Storage");
    expect(databaseLockContention.library?.tags.length).toBeGreaterThan(0);
    expect(databaseLockContention.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(databaseLockContentionSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.blockedTransactions).toBe(0);
    expect(state.values.lockStatus).toBe("normal");
  });

  it("contends critically when the batch job starts with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.blockedTransactions).toBe(180);
    expect(state.values.lockStatus).toBe("critical");
  });

  it("recovers cleanly with small batch chunks and low concurrency", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 100 },
      { atMs: 31_000, controlKey: BATCH_JOB_CONCURRENCY_KEY, value: 2 },
    ]);

    // The engine itself never auto-writes "resolved" (Phase 7.1 doctrine)
    // — only an explicit Finish declaration can.
    expect(state.status).not.toBe("resolved");
    expect(state.values.blockedTransactions).toBe(2);
    expect(evaluateCandidateDeclaredFinish(databaseLockContentionSimulation, state).outcome).toBe(
      "resolved",
    );
  });

  it("using a much larger chunk size to 'finish faster' is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithOversizedChunks = runScenario(35_000, [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 50_000 },
    ]);

    expect(stateWithOversizedChunks.values.blockedTransactions).toBeGreaterThan(
      stateWithoutMitigation.values.blockedTransactions as number,
    );
    expect(stateWithOversizedChunks.values.lockStatus).toBe("critical");
  });

  it("a very long lock timeout masks timeouts without fixing the underlying contention", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: LOCK_TIMEOUT_MS_KEY, value: 300_000 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.timedOutTransactions).toBe(0);
    expect(state.values.lockStatus).toBe("warning");
    expect(state.values.blockedTransactions).toBe(210);
  });

  it("reducing only the chunk size is a partial improvement", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 1_000 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.lockStatus).toBe("warning");
    expect(state.values.blockedTransactions).toBe(55);
  });

  it("escalates when a second concurrent batch job joins unmitigated", () => {
    const state = runScenario(5 * 60_000 + 10_000);
    expect(state.values.lockStatus).toBe("critical");
    expect(state.values.blockedTransactions).toBe(310);
  });

  it("fails if blocked transactions stay critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak blocked transactions generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.blockedTransactions).toBe(180);
  });

  it("tracks monthly infrastructure cost that increases with batch job concurrency", () => {
    let state = createInitialState(databaseLockContentionSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(100);

    const tickMs = databaseLockContentionSimulation.tickMs;
    const action: CandidateAction = {
      id: "raise-concurrency",
      timestampMs: 0,
      controlKey: BATCH_JOB_CONCURRENCY_KEY,
      value: 8,
    };
    state = simulate(databaseLockContentionSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(260);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 100 },
      { atMs: 31_000, controlKey: BATCH_JOB_CONCURRENCY_KEY, value: 2 },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring orders good > {baseline, partial} > harmful", () => {
    // The engine itself never auto-writes resolvedAtMs (Phase 7.1
    // doctrine) — the good path is scored via its Finish declaration,
    // never a raw extractScoringInputs call on the unresolved state.

    // Good: small-chunks-low-concurrency-recovery (rules.ts) —
    // chunk size <= 100 AND concurrency <= 2 while the batch job is
    // running drops blockedTransactions to 2 and lockStatus to "normal",
    // satisfying successCondition (blockedTransactions <= 5,
    // timedOutTransactions == 0, lockStatus != "critical") once sustained
    // for 15s — a genuine, declarable resolution.
    const goodActions: TimedAction[] = [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 100 },
      { atMs: 31_000, controlKey: BATCH_JOB_CONCURRENCY_KEY, value: 2 },
    ];

    // Partial: smaller-chunks-only (rules.ts) — chunk size reduced to
    // <= 1_000 but concurrency left at its initial value of 4. Less lock
    // time per transaction, but still many concurrent lock holders, so
    // blockedTransactions settles at 55 (above the successCondition's
    // <= 5 bar, but below failureCondition's >= 150 bar) and lockStatus
    // stays "warning" — a genuine, distinct partial-improvement rule
    // state that never reaches resolved *or* failed; it idles in
    // "degraded" for the run.
    const partialActions: TimedAction[] = [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 1_000 },
    ];

    // Harmful: oversized-chunks-harmful (rules.ts) and the matching
    // action-classifications.ts entry (chunkSize >= 50_000 while
    // batchJobRunning is "harmful") — a much larger chunk size holds
    // each row lock far longer, worsening blocking to 340 blocked
    // transactions versus the unmitigated baseline's 180.
    const harmfulActions: TimedAction[] = [
      { atMs: 31_000, controlKey: BATCH_JOB_CHUNK_SIZE_KEY, value: 50_000 },
    ];

    // Baseline: no candidate actions at all. contention-critical-default
    // (rules.ts) holds blockedTransactions at 180, which is >= 150 and
    // once sustained 60s (failureCondition.sustainedSeconds) drives the
    // incident to failed.
    const FAIL_WINDOW_MS = 30_000 + 61_000;

    const goodState = runScenario(50_000, goodActions);
    const partialState = runScenario(FAIL_WINDOW_MS, partialActions);
    const harmfulState = runScenario(FAIL_WINDOW_MS, harmfulActions);
    const baselineState = runScenario(FAIL_WINDOW_MS);

    it("reaches the expected terminal/incident states for each sequence", () => {
      expect(goodState.status).not.toBe("resolved");
      expect(
        evaluateCandidateDeclaredFinish(databaseLockContentionSimulation, goodState).outcome,
      ).toBe("resolved");
      // 55 blocked transactions clears successCondition's unresolved bar
      // but never crosses failureCondition's >= 150 bar either, so the
      // partial sequence genuinely idles mid-incident rather than ever
      // terminating.
      expect(partialState.status).toBe("degraded");
      expect(harmfulState.status).toBe("failed");
      expect(baselineState.status).toBe("failed");
    });

    const goodFinish = evaluateCandidateDeclaredFinish(
      databaseLockContentionSimulation,
      goodState,
    );
    const goodScore = scoreAuthoredAttempt(
      DATABASE_LOCK_CONTENTION_SCORING,
      extractFinishScoringInputs(databaseLockContentionSimulation, goodFinish),
    );
    const partialScore = scoreAuthoredAttempt(
      DATABASE_LOCK_CONTENTION_SCORING,
      extractScoringInputs(databaseLockContentionSimulation, partialState),
    );
    const harmfulScore = scoreAuthoredAttempt(
      DATABASE_LOCK_CONTENTION_SCORING,
      extractScoringInputs(databaseLockContentionSimulation, harmfulState),
    );
    const baselineScore = scoreAuthoredAttempt(
      DATABASE_LOCK_CONTENTION_SCORING,
      extractScoringInputs(databaseLockContentionSimulation, baselineState),
    );

    it("scores the clean recovery (good) above the partial-improvement trap state", () => {
      // good = 830 (resolved, via Finish: full recovery credit since
      // recoveryTimeSeconds only zeroes out via terminalOverrides on
      // failed/unresolved — but reliability lands in the worst band
      // (15/150) because deriveScoringResolvedAtMs credits the instant
      // success first became true, not the moment its sustain window
      // finished, so criticalTimeRatio is measured against a much
      // shorter window than the pre-Phase-7.1 auto-resolving engine
      // used); partial = 515 (unresolved, so terminalOverrides zero out
      // recovery and reliability entirely). Either way, good clearly
      // outscores partial.
      expect(goodScore.total).toBeGreaterThan(partialScore.total);
    });

    it("scores the never-resolving partial sequence the same as doing nothing", () => {
      // Both land on recovery=0 and reliability=0 via `unresolved`/
      // `failed` terminalOverrides respectively, and both land in
      // customerImpact's top `atMost: 5_000` band (revenueLossUsd ~102
      // for partial vs. ~362 for baseline over this short window — a
      // real difference the bands are simply too coarse to reflect).
      // operationalEfficiency is identical too: neither sequence trips
      // any harmfulChangeCount/configurationChangeCount penalty, so both
      // keep its full 50 points. There is no distinct "partial beats
      // baseline" tier for this scenario — reducing only the chunk size
      // measurably shrinks blockedTransactions (55 vs. 180) but never
      // earns more scoring credit than taking no action at all, because
      // it never crosses into a scored-differently terminal state.
      expect(partialScore.total).toBe(baselineScore.total);
    });

    it("scores the oversized-chunk harmful trap below the unmitigated baseline failure", () => {
      // Both harmful and baseline fail (recovery=0, reliability=0 via
      // the `failed` terminalOverrides), and customerImpact is tied at
      // 200 for both (561.67 and 361.66 revenueLossUsd both land inside
      // the same top `atMost: 5_000` band — again too coarse to show the
      // real difference from "severe-contention" at 550/min vs.
      // "contending" at 350/min in revenue-and-cost.ts). The one axis
      // that *does* differ is operationalEfficiency: the harmful chunk
      // size >= 50_000 action matches action-classifications.ts's
      // "harmful" outcome, tripping scoring.ts's
      // `harmfulChangeCount atLeast: 1 -> subtractPoints: 15` penalty
      // (harmful = 35 vs. baseline's untouched 50), which is exactly
      // scoring.ts's intent ("a plausible-but-harmful mitigation must
      // score worse than inaction").
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      expect(harmfulScore.breakdown.operationalEfficiency).toBeLessThan(
        baselineScore.breakdown.operationalEfficiency,
      );
    });

    it("scores the clean recovery (good) above every other sequence", () => {
      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(goodScore.total).toBeGreaterThan(harmfulScore.total);
    });
  });
});
