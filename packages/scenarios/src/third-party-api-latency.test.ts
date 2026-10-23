import { createInitialState, extractScoringInputs, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./authoring/score";
import { thirdPartyApiLatency } from "./third-party-api-latency";
import {
  API_TIMEOUT_MS_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
  thirdPartyApiLatencySimulation,
} from "./third-party-api-latency/definition";
import { THIRD_PARTY_API_LATENCY_SCORING } from "./third-party-api-latency/scoring";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(thirdPartyApiLatencySimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += thirdPartyApiLatencySimulation.tickMs
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
      thirdPartyApiLatencySimulation,
      state,
      action,
      thirdPartyApiLatencySimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

describe("Third-Party API Latency", () => {
  it("carries real library metadata and is a paid launch scenario", () => {
    expect(thirdPartyApiLatency.isFree).toBe(false);
    expect(thirdPartyApiLatency.library?.category).toBe("API & Traffic");
    expect(thirdPartyApiLatency.library?.tags.length).toBeGreaterThan(0);
    expect(thirdPartyApiLatency.library?.skills.length).toBeGreaterThan(0);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(thirdPartyApiLatencySimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.thirdPartyResponseTimeMs).toBe(180);
    expect(state.values.checkoutStatus).toBe("normal");
  });

  it("degrades checkout critically when the vendor slows down with no mitigation", () => {
    const state = runScenario(31_000);
    expect(state.incidentStartedAtMs).toBe(30_000);
    expect(state.status).toBe("critical");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(85);
    expect(state.values.checkoutStatus).toBe("critical");
  });

  it("recovers when the timeout is shortened and cached fallback is enabled", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(28);
  });

  it("recovers even better with async processing added on top", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: ASYNC_PROCESSING_ENABLED_KEY, value: true },
    ]);

    expect(state.status).toBe("resolved");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(18);
  });

  it("lengthening the timeout while the vendor is slow is harmful, not helpful", () => {
    const stateWithoutMitigation = runScenario(35_000);
    const stateWithLongerTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 20_000 },
    ]);

    expect(stateWithLongerTimeout.values.checkoutServiceThreadPoolUtilization).toBeGreaterThan(
      stateWithoutMitigation.values.checkoutServiceThreadPoolUtilization as number,
    );
    expect(stateWithLongerTimeout.values.checkoutStatus).toBe("critical");
  });

  it("shortening the timeout alone without enabling fallback only partially helps", () => {
    const state = runScenario(50_000, [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.checkoutStatus).toBe("warning");
    expect(state.values.checkoutServiceThreadPoolUtilization).toBe(55);
    expect(state.values.cacheFallbackHitRate).toBe(0);
  });

  it("fails if checkout thread pool stays critical for the full sustained window", () => {
    const state = runScenario(30_000 + 61_000);
    expect(state.status).toBe("failed");
    expect(state.failedAtMs).not.toBeNull();
  });

  it("tracks peak checkout thread pool utilization generically via numericWatchFields", () => {
    const state = runScenario(31_000);
    expect(state.peaks.peakValues.checkoutServiceThreadPoolUtilization).toBe(85);
  });

  it("tracks monthly infrastructure cost that increases when cached fallback is enabled", () => {
    let state = createInitialState(thirdPartyApiLatencySimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(80);

    const tickMs = thirdPartyApiLatencySimulation.tickMs;
    const action: CandidateAction = {
      id: "enable-fallback",
      timestampMs: 0,
      controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
      value: true,
    };
    state = simulate(thirdPartyApiLatencySimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(120);
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
    ];

    const runA = runScenario(45_000, actions);
    const runB = runScenario(45_000, actions);

    expect(runA).toEqual(runB);
  });

  describe("scoring orders good > {baseline, partial} > harmful", () => {
    // Third-Party API Latency is plain "automatic" completion mode
    // (definition.ts sets no `completion` field at all, so tick.ts's
    // `scenario.completion?.mode ?? "automatic"` default applies) — the
    // engine auto-writes resolvedAtMs once successCondition has been
    // sustained for successCondition.sustainedSeconds (15s), so a direct
    // extractScoringInputs(simulation, state) call is correct; no
    // evaluateCandidateDeclaredFinish/extractFinishScoringInputs dance is
    // needed here.

    // Good: full-mitigation-recovery (rules.ts) — timeout <= 2_000 AND
    // cached fallback enabled AND async processing enabled while the
    // vendor is slow drops checkoutServiceThreadPoolUtilization to 18 and
    // checkoutAbandonmentRate to 2 with checkoutStatus "normal",
    // satisfying successCondition (<=35 utilization, <6% abandonment,
    // status != critical) once sustained 15s, so the engine auto-resolves.
    const goodActions: TimedAction[] = [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 2_000 },
      { atMs: 31_000, controlKey: CACHED_RESPONSE_FALLBACK_ENABLED_KEY, value: true },
      { atMs: 31_000, controlKey: ASYNC_PROCESSING_ENABLED_KEY, value: true },
    ];

    // Partial: short-timeout-without-fallback (rules.ts) — timeout
    // shortened to <= 500 but cached fallback never enabled. Thread pool
    // pressure eases to 55% (clears failureCondition's >= 80 bar, so it
    // never fails) but every failed request surfaces as a hard error
    // instead of a cached rate, so checkoutAbandonmentRate stays at 22
    // (never clears successCondition's < 6 bar) and checkoutStatus stays
    // "warning" — a genuine, distinct partial-improvement rule state that
    // never reaches resolved *or* failed; it idles in "degraded" for the
    // run.
    const partialActions: TimedAction[] = [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 500 },
    ];

    // Harmful: lengthened-timeout-harmful (rules.ts) and the matching
    // action-classifications.ts entry (apiTimeoutMs >= 8_000 while
    // vendorSlow is "harmful") — lengthening the timeout while the vendor
    // is slow only ties up more checkout-service thread-pool capacity per
    // request, worsening utilization to 96% versus the unmitigated
    // baseline's 85%, and abandonment to 38% versus 30%.
    const harmfulActions: TimedAction[] = [
      { atMs: 31_000, controlKey: API_TIMEOUT_MS_KEY, value: 20_000 },
    ];

    // Baseline: no candidate actions at all. vendor-slow-default
    // (rules.ts) holds checkoutServiceThreadPoolUtilization at 85, which
    // is >= 80 and once sustained 60s (failureCondition.sustainedSeconds)
    // drives the incident to failed.
    const FAIL_WINDOW_MS = 30_000 + 61_000;

    const goodState = runScenario(50_000, goodActions);
    const partialState = runScenario(FAIL_WINDOW_MS, partialActions);
    const harmfulState = runScenario(FAIL_WINDOW_MS, harmfulActions);
    const baselineState = runScenario(FAIL_WINDOW_MS);

    it("reaches the expected terminal/incident states for each sequence", () => {
      expect(goodState.status).toBe("resolved");
      // 55% utilization clears failureCondition's >= 80 bar, but 22%
      // abandonment never clears successCondition's < 6 bar either, so
      // the partial sequence genuinely idles mid-incident rather than
      // ever terminating.
      expect(partialState.status).toBe("degraded");
      expect(harmfulState.status).toBe("failed");
      expect(baselineState.status).toBe("failed");
    });

    const goodScore = scoreAuthoredAttempt(
      THIRD_PARTY_API_LATENCY_SCORING,
      extractScoringInputs(thirdPartyApiLatencySimulation, goodState),
    );
    const partialScore = scoreAuthoredAttempt(
      THIRD_PARTY_API_LATENCY_SCORING,
      extractScoringInputs(thirdPartyApiLatencySimulation, partialState),
    );
    const harmfulScore = scoreAuthoredAttempt(
      THIRD_PARTY_API_LATENCY_SCORING,
      extractScoringInputs(thirdPartyApiLatencySimulation, harmfulState),
    );
    const baselineScore = scoreAuthoredAttempt(
      THIRD_PARTY_API_LATENCY_SCORING,
      extractScoringInputs(thirdPartyApiLatencySimulation, baselineState),
    );

    it("scores the clean recovery (good) above the never-resolving partial and baseline sequences", () => {
      // good = 950 (resolved: full recovery/reliability credit, since
      // recoveryTimeSeconds/criticalTimeRatio only zero out via
      // terminalOverrides on failed/unresolved); partial = baseline = 550
      // (both unresolved, so terminalOverrides zero out recovery and
      // reliability entirely for both).
      expect(goodScore.total).toBeGreaterThan(partialScore.total);
      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
    });

    it("scores the never-resolving partial sequence the same as doing nothing", () => {
      // Both land on recovery=0 and reliability=0 via the `unresolved`/
      // `failed` terminalOverrides respectively, both land in
      // customerImpact's top `atMost: 5_000` band (revenueLossUsd stays
      // well under $5k over this short incident window regardless of
      // mitigation), both score dataIntegrity's flat 200 (single
      // catch-all band), both land in costEfficiency's `atMost: 0` band
      // (neither sequence raises monthly infrastructure cost), and both
      // score operationalEfficiency's full 50 (one beneficial
      // configuration change is not enough to trip the
      // configurationChangeCount >= 6 penalty, and neither sequence makes
      // a harmful change) — so the two sequences tie exactly despite
      // reaching their shared "stuck mid-incident" outcome by different
      // rule paths.
      expect(partialScore.total).toBe(baselineScore.total);
    });

    it("scores the harmful lengthened-timeout sequence below both the baseline and the partial sequence", () => {
      // harmful = 535, strictly below partial/baseline's 550. Both
      // harmful and baseline reach "failed" via the same
      // failureCondition, so recovery/reliability are 0 for both and
      // customerImpact/dataIntegrity/costEfficiency land in the same
      // bands — the only dimension that differs is
      // operationalEfficiency, where the harmful sequence's one harmful
      // configuration change trips the
      // operationalEfficiency.penalties "harmfulChangeCount >= 1,
      // subtractPoints 15" penalty (50 -> 35) that neither the baseline
      // nor the partial sequence ever triggers.
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      expect(harmfulScore.total).toBeLessThan(partialScore.total);
    });
  });
});
