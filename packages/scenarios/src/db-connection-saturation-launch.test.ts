import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { dbConnectionSaturation } from "./db-connection-saturation";
import {
  dbConnectionSaturationSimulation,
  POOL_SIZE_KEY,
  QUERY_TIMEOUT_MS_KEY,
  READ_REPLICA_ENABLED_KEY,
} from "./db-connection-saturation/definition";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dbConnectionSaturationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dbConnectionSaturationSimulation.tickMs
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
      dbConnectionSaturationSimulation,
      state,
      action,
      dbConnectionSaturationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

/**
 * Candidate-facing launch coverage added when Database Connection
 * Saturation was promoted from a Phase 5 genericity proof into a real
 * Phase 6 launch scenario (docs/implementation_plan/phase6.md) — same
 * scenario identity, same slug, upgraded content. Complements (does not
 * replace) db-connection-saturation.test.ts's genericity-proof suite,
 * which continues to pass unchanged against the original control
 * combinations it exercises.
 */
describe("Database Connection Saturation — launch quality", () => {
  it("carries real library metadata with exactly one primary category", () => {
    expect(dbConnectionSaturation.library).toBeDefined();
    expect(dbConnectionSaturation.library?.category).toBe("Databases & Storage");
    expect(dbConnectionSaturation.library?.tags.length).toBeGreaterThan(0);
    expect(dbConnectionSaturation.library?.skills.length).toBeGreaterThan(0);
    expect(dbConnectionSaturation.library?.shortDescription.length).toBeGreaterThan(0);
  });

  it("is a real launch scenario, not a 5-minute proof stub", () => {
    expect(dbConnectionSaturation.estimatedMinutes).toBeGreaterThanOrEqual(10);
    expect(dbConnectionSaturation.difficulty).toBe("senior");
  });

  it("raising the query timeout on a small pool is a harmful, not helpful, mitigation", () => {
    const baseline = runScenario(35_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 20 },
    ]);
    const withHighTimeout = runScenario(35_000, [
      { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 15_000 },
    ]);

    expect(withHighTimeout.values.connectionUsage).toBeGreaterThanOrEqual(
      baseline.values.connectionUsage as number,
    );
    expect(withHighTimeout.values.queuedConnections).toBeGreaterThan(
      baseline.values.queuedConnections as number,
    );
    expect(withHighTimeout.values.dbStatus).toBe("critical");
  });

  it("a scaled pool without a read replica degrades again once the batch job overlaps", () => {
    const beforeEscalation = runScenario(31_000 + 60_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    ]);
    expect(beforeEscalation.values.dbStatus).toBe("warning");

    const afterEscalation = runScenario(5 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    ]);
    expect(afterEscalation.values.dbStatus).toBe("critical");
  });

  it("Phase 6.1: a scaled-pool-only candidate sees queuedConnections visibly rising before the batch job fully engages (observable fairness fix)", () => {
    // Regression test for a Phase 6.1 state-audit finding: scaled-pool-only
    // previously looked indefinitely stable (queuedConnections stuck at
    // 40) with zero observable warning before batch-job-overlap silently
    // reverted it to critical at t=5min — a hidden-script-only gotcha a
    // candidate had no honest way to anticipate. Fixed by adding a
    // candidate-visible precursor: queuedConnections rises from 40 to
    // 165 once batchPressureRising fires at t=3min, a real reason to
    // keep observing rather than declaring Finish.
    const beforePressureRises = runScenario(31_000 + 60_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    ]);
    expect(beforePressureRises.values.queuedConnections).toBe(40);

    const afterPressureRises = runScenario(3 * 60_000 + 10_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
    ]);
    expect(afterPressureRises.values.queuedConnections).toBeGreaterThan(
      beforePressureRises.values.queuedConnections as number,
    );
    expect(afterPressureRises.values.dbStatus).toBe("warning");
    // Still not critical yet — this is a warning signal, not the
    // escalation itself, giving the candidate a genuine window to react.
    expect(afterPressureRises.values.queuedConnections).toBeLessThan(260);
  });

  it("scaling the pool AND enabling the read replica reaches a sustained success state that survives the batch-job escalation (Phase 6.1: candidate_declared, never auto-resolves)", () => {
    const state = runScenario(5 * 60_000 + 30_000, [
      { atMs: 31_000, controlKey: POOL_SIZE_KEY, value: 200 },
      { atMs: 31_000, controlKey: READ_REPLICA_ENABLED_KEY, value: true },
    ]);

    expect(state.status).not.toBe("resolved");
    expect(state.values.connectionUsage).toBeLessThanOrEqual(60);
    expect(state.values.errorRate).toBeLessThan(1);
    expect(state.values.dbStatus).not.toBe("critical");
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      dbConnectionSaturationSimulation.successCondition.sustainedSeconds,
    );
  });

  it("tracks monthly infrastructure cost that increases with pool size", () => {
    let state = createInitialState(dbConnectionSaturationSimulation);
    expect(state.cost.currentMonthlyCostUsd).toBe(200);

    const tickMs = dbConnectionSaturationSimulation.tickMs;
    const action: CandidateAction = {
      id: "scale-pool",
      timestampMs: 0,
      controlKey: POOL_SIZE_KEY,
      value: 200,
    };
    state = simulate(dbConnectionSaturationSimulation, state, action, tickMs).state;

    expect(state.cost.currentMonthlyCostUsd).toBe(620);
  });

  it("classifies a small-pool-plus-high-timeout action sequence as harmful for operational efficiency", () => {
    const state = runScenario(35_000, [
      { atMs: 31_000, controlKey: QUERY_TIMEOUT_MS_KEY, value: 15_000 },
    ]);

    // The harmful-timeout rule only engages while the pool is still small
    // (poolSize <= 50, the initial value) — confirms the harmful path is
    // reachable without any pool-size change at all.
    expect(state.values.dbStatus).toBe("critical");
    expect(state.values.errorRate).toBeGreaterThan(30);
  });
});
