import { describe, expect, it } from "vitest";
import { ATTEMPT_CEILING_MS } from "./tick";
import { createInitialState, simulate } from "./simulate";
import type { ScenarioSimulationDefinition } from "./types";

/**
 * A breach of failureCondition must never terminate an attempt on its
 * own — only the uniform ATTEMPT_CEILING_MS backstop, or reaching
 * successCondition, is allowed to end it automatically. See the
 * decision behind packages/simulator/src/tick.ts's status transition.
 */
const scenario: ScenarioSimulationDefinition = {
  tickMs: 1_000,
  architecture: { nodes: [{ id: "svc", label: "Service" }], edges: [] },
  controls: [],
  initialValues: { errorRate: 0.1 },
  initialComponentHealth: { svc: "healthy" },
  severityFields: [],
  numericWatchFields: [],
  timedEvents: [
    { id: "start", atMs: 0, type: "TRIGGER_SET", message: "Incident begins.", setTriggers: { active: true } },
  ],
  rules: [
    {
      id: "breached",
      when: { triggerEquals: { active: true } },
      incidentState: "critical",
      values: { errorRate: 90 },
      componentHealth: { svc: "critical" },
    },
    {
      id: "default",
      when: {},
      incidentState: "healthy",
      values: { errorRate: 0.1 },
      componentHealth: { svc: "healthy" },
    },
  ],
  revenueLossRatePerMinute: { healthy: 0, critical: 0 },
  infrastructureCost: { baselineMonthlyUsd: 100, perUnitMonthlyUsd: {} },
  successCondition: { conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }], sustainedSeconds: 5 },
  failureCondition: { conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }], sustainedSeconds: 10 },
  actionClassifications: [],
};

describe("tickOnce: automatic failure trigger", () => {
  it("does not fail the attempt merely because failureCondition has been sustained past its threshold", () => {
    const state = createInitialState(scenario);
    // 5 minutes of continuous breach — far past the old 10s sustainedSeconds — attempt must stay active.
    const result = simulate(scenario, state, null, 5 * 60 * 1000);

    expect(result.state.status).not.toBe("failed");
    expect(result.state.failedAtMs).toBeNull();
    expect(result.state.transitions.consecutiveFailureSeconds).toBeGreaterThan(
      scenario.failureCondition.sustainedSeconds,
    );
  });

  it("fails the attempt once the uniform attempt ceiling is reached", () => {
    const state = createInitialState(scenario);
    const result = simulate(scenario, state, null, ATTEMPT_CEILING_MS);

    expect(result.state.status).toBe("failed");
    expect(result.state.failedAtMs).toBe(ATTEMPT_CEILING_MS);
    expect(result.events.some((e) => e.type === "INCIDENT_FAILED")).toBe(true);
  });

  it("still accumulates consecutiveSuccessSeconds after an earlier failureCondition breach, never surfacing as failed", () => {
    let state = createInitialState(scenario);
    // Breach failureCondition for a while first...
    state = simulate(scenario, state, null, 60_000).state;
    expect(state.status).not.toBe("failed");

    // ...then recover below the success threshold and sustain it. The
    // engine itself never auto-writes status="resolved" (only finishAttempt,
    // server-side, does, per the "never pass automatically" doctrine) — so
    // what matters here is that consecutiveSuccessSeconds keeps accumulating
    // normally, unaffected by the earlier breach, and status never becomes
    // "failed" in the process.
    const recoveredScenario: ScenarioSimulationDefinition = {
      ...scenario,
      rules: [
        {
          id: "recovered",
          when: { triggerEquals: { active: true } },
          incidentState: "healthy",
          values: { errorRate: 0.1 },
          componentHealth: { svc: "healthy" },
        },
        scenario.rules[1]!,
      ],
    };
    const result = simulate(recoveredScenario, state, null, 10_000);

    expect(result.state.status).not.toBe("failed");
    expect(result.state.failedAtMs).toBeNull();
    expect(result.state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      scenario.successCondition.sustainedSeconds,
    );
  });
});
