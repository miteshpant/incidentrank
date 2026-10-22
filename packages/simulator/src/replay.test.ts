import { describe, expect, it } from "vitest";
import { createInitialState, simulate } from "./simulate";
import { replayAttempt, type ReplayActionGroup } from "./replay";
import type {
  CandidateAction,
  ScenarioSimulationDefinition,
} from "./types";

/**
 * A minimal but representative fixture, modeled on Payment Retry Storm's
 * shape (provider degrades at T=60s, retries/backoff/circuitBreaker
 * controls, a recovery rule, success/failure conditions) — kept inline so
 * packages/simulator stays independent of packages/scenarios, per
 * docs/architecture.md principle 2. Uses the fully generic engine shape
 * (values/triggers/StateCondition) to double as a genericity proof: this
 * fixture carries zero Payment-Retry-Storm-specific engine code.
 */
const baseValues = {
  checkoutSuccessRate: 99.9,
  checkoutP99LatencyMs: 420,
  paymentTraffic: "normal" as const,
  dbPressure: "normal" as const,
};

const scenario: ScenarioSimulationDefinition = {
  tickMs: 1000,
  architecture: { nodes: [], edges: [] },
  controls: [
    { key: "retries", allowedValues: [0, 1, 3, 5], initialValue: 3 },
    {
      key: "backoff",
      allowedValues: ["none", "fixed", "exponential"],
      initialValue: "none",
    },
    { key: "circuitBreaker", allowedValues: ["off", "on"], initialValue: "off" },
  ],
  initialValues: baseValues,
  initialComponentHealth: {},
  severityFields: [{ key: "paymentTraffic" }, { key: "dbPressure" }],
  numericWatchFields: [],
  timedEvents: [
    {
      id: "provider-degraded",
      atMs: 60_000,
      type: "TRIGGER_SET",
      message: "Payment provider latency has increased sharply.",
      setTriggers: { providerDegraded: true },
    },
  ],
  rules: [
    {
      id: "good-recovery",
      when: {
        triggerEquals: { providerDegraded: true },
        controlAtMost: { retries: 1 },
        controlEquals: { backoff: "exponential", circuitBreaker: "on" },
      },
      incidentState: "recovering",
      values: {
        ...baseValues,
        checkoutSuccessRate: 96,
        checkoutP99LatencyMs: 1600,
        paymentTraffic: "normal",
        dbPressure: "normal",
      },
      componentHealth: {},
    },
    {
      id: "reduced-retries",
      when: { triggerEquals: { providerDegraded: true }, controlAtMost: { retries: 1 } },
      incidentState: "storm-reduced",
      values: {
        ...baseValues,
        checkoutSuccessRate: 84,
        checkoutP99LatencyMs: 4200,
        paymentTraffic: "warning",
      },
      componentHealth: {},
    },
    {
      id: "default-critical",
      when: { triggerEquals: { providerDegraded: true } },
      incidentState: "storm-critical",
      values: {
        ...baseValues,
        checkoutSuccessRate: 72,
        checkoutP99LatencyMs: 6400,
        paymentTraffic: "critical",
      },
      componentHealth: {},
    },
  ],
  revenueLossRatePerMinute: { "storm-critical": 1000, "storm-reduced": 200, recovering: 0 },
  infrastructureCost: { baselineMonthlyUsd: 20_000, perUnitMonthlyUsd: {} },
  successCondition: {
    conditions: [
      { key: "checkoutSuccessRate", operator: "greater_than_or_equal", comparedTo: 95 },
      { key: "checkoutP99LatencyMs", operator: "less_than_or_equal", comparedTo: 3000 },
      { key: "paymentTraffic", operator: "not_equals", comparedTo: "critical" },
      { key: "dbPressure", operator: "not_equals", comparedTo: "critical" },
    ],
    sustainedSeconds: 30,
  },
  failureCondition: {
    conditions: [
      { key: "checkoutSuccessRate", operator: "less_than", comparedTo: 60 },
    ],
    sustainedSeconds: 180,
  },
  actionClassifications: [
    {
      controlKey: "retries",
      valueAtMost: 1,
      whenTriggerEquals: { providerDegraded: true },
      outcome: "beneficial",
    },
  ],
};

function runUninterrupted(actions: CandidateAction[], elapsedMs: number) {
  let state = createInitialState(scenario);
  const sorted = [...actions].sort((a, b) => a.timestampMs - b.timestampMs);

  for (const action of sorted) {
    const gap = action.timestampMs - state.simulationTimeMs;
    if (gap > 0) {
      state = simulate(scenario, state, null, gap).state;
    }
    state = simulate(scenario, state, action, 0).state;
  }

  const finalGap = elapsedMs - state.simulationTimeMs;
  if (finalGap > 0) {
    state = simulate(scenario, state, null, finalGap).state;
  }
  return state;
}

const STRONG_MITIGATION: ReplayActionGroup[] = [
  { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
  { elapsedMs: 90_000, changes: [{ controlKey: "backoff", value: "exponential" }] },
  { elapsedMs: 120_000, changes: [{ controlKey: "circuitBreaker", value: "on" }] },
];

describe("replayAttempt", () => {
  it("replay baseline: no actions matches uninterrupted simulation to the same elapsed time", () => {
    const elapsedMs = 90_000;
    const replayed = replayAttempt({ scenario, elapsedMs, actionGroups: [] });
    const uninterrupted = runUninterrupted([], elapsedMs);

    expect(replayed.state).toEqual(uninterrupted);
  });

  it("replay with one action matches an uninterrupted run with the same action", () => {
    const elapsedMs = 100_000;
    const actionGroups: ReplayActionGroup[] = [
      { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
    ];

    const replayed = replayAttempt({ scenario, elapsedMs, actionGroups });
    const uninterrupted = runUninterrupted(
      [{ id: "a1", timestampMs: 65_000, controlKey: "retries", value: 1 }],
      elapsedMs,
    );

    expect(replayed.state).toEqual(uninterrupted);
  });

  it("replay with a grouped multi-control action replays all controls in original sequence", () => {
    const elapsedMs = 70_000;
    const actionGroups: ReplayActionGroup[] = [
      {
        elapsedMs: 65_000,
        changes: [
          { controlKey: "retries", value: 1 },
          { controlKey: "backoff", value: "exponential" },
          { controlKey: "circuitBreaker", value: "on" },
        ],
      },
    ];

    const replayed = replayAttempt({ scenario, elapsedMs, actionGroups });
    const uninterrupted = runUninterrupted(
      [
        { id: "a1", timestampMs: 65_000, controlKey: "retries", value: 1 },
        { id: "a2", timestampMs: 65_000, controlKey: "backoff", value: "exponential" },
        { id: "a3", timestampMs: 65_000, controlKey: "circuitBreaker", value: "on" },
      ],
      elapsedMs,
    );

    expect(replayed.state.controlValues).toEqual(uninterrupted.controlValues);
    expect(replayed.state).toEqual(uninterrupted);
  });

  it("replay with multiple candidate decisions matches the final uninterrupted state", () => {
    const elapsedMs = 200_000;
    const replayed = replayAttempt({
      scenario,
      elapsedMs,
      actionGroups: STRONG_MITIGATION,
    });

    const uninterrupted = runUninterrupted(
      [
        { id: "a1", timestampMs: 65_000, controlKey: "retries", value: 1 },
        { id: "a2", timestampMs: 90_000, controlKey: "backoff", value: "exponential" },
        { id: "a3", timestampMs: 120_000, controlKey: "circuitBreaker", value: "on" },
      ],
      elapsedMs,
    );

    expect(replayed.state).toEqual(uninterrupted);
    expect(replayed.state.status).toBe(uninterrupted.status);
  });

  it("stops applying decisions recorded after the target elapsed time", () => {
    const elapsedMs = 80_000; // before the 90_000ms backoff change
    const replayed = replayAttempt({
      scenario,
      elapsedMs,
      actionGroups: STRONG_MITIGATION,
    });

    expect(replayed.state.controlValues.retries).toBe(1);
    expect(replayed.state.controlValues.backoff).toBe("none");
    expect(replayed.state.controlValues.circuitBreaker).toBe("off");
    expect(replayed.state.simulationTimeMs).toBe(elapsedMs);
  });

  it("produces identical scoring-relevant state regardless of how action groups are ordered in the input array", () => {
    const elapsedMs = 200_000;
    const shuffled = [STRONG_MITIGATION[2]!, STRONG_MITIGATION[0]!, STRONG_MITIGATION[1]!];

    const replayedInOrder = replayAttempt({
      scenario,
      elapsedMs,
      actionGroups: STRONG_MITIGATION,
    });
    const replayedShuffled = replayAttempt({
      scenario,
      elapsedMs,
      actionGroups: shuffled,
    });

    expect(replayedShuffled.state).toEqual(replayedInOrder.state);
  });

  it("resolves the incident deterministically when replayed to a later elapsed time", () => {
    const elapsedMs = 200_000;
    const replayed = replayAttempt({
      scenario,
      elapsedMs,
      actionGroups: STRONG_MITIGATION,
    });

    expect(replayed.state.status).toBe("resolved");
    expect(replayed.state.resolvedAtMs).not.toBeNull();
  });
});
