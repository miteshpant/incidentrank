import { describe, expect, it } from "vitest";
import { extractScoringInputs } from "./scoring";
import { createInitialState, simulate } from "./simulate";
import type { ScenarioSimulationDefinition } from "./types";

/**
 * Phase 6.1: generic string-state support in ScoringInputs
 * (docs/implementation_plan/phase6.1.md's acceptableCondition tier
 * work) — finalStringValues is a sibling of finalNumericValues,
 * populated the same way, so string-valued scenario state (e.g. a
 * tradeoff-tracking field) is no longer silently dropped at the
 * scoring boundary.
 */
const scenario: ScenarioSimulationDefinition = {
  tickMs: 1_000,
  architecture: { nodes: [{ id: "svc", label: "Service" }], edges: [] },
  controls: [],
  initialValues: { errorRate: 0.1, mode: "normal" },
  initialComponentHealth: { svc: "healthy" },
  severityFields: [],
  numericWatchFields: [],
  timedEvents: [],
  rules: [
    {
      id: "default",
      when: {},
      incidentState: "healthy",
      values: { errorRate: 0.1, mode: "normal" },
      componentHealth: { svc: "healthy" },
    },
  ],
  revenueLossRatePerMinute: { healthy: 0 },
  infrastructureCost: { baselineMonthlyUsd: 100, perUnitMonthlyUsd: {} },
  successCondition: { conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }], sustainedSeconds: 5 },
  failureCondition: { conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }], sustainedSeconds: 10 },
  actionClassifications: [],
};

describe("extractScoringInputs: numeric and string state", () => {
  it("populates finalNumericValues from numeric state.values entries only", () => {
    const state = createInitialState(scenario);
    const inputs = extractScoringInputs(scenario, state);
    expect(inputs.finalNumericValues).toEqual({ errorRate: 0.1 });
  });

  it("populates finalStringValues from string state.values entries only — no longer silently dropped", () => {
    const state = createInitialState(scenario);
    const inputs = extractScoringInputs(scenario, state);
    expect(inputs.finalStringValues).toEqual({ mode: "normal" });
  });

  it("keeps numeric scoring inputs unchanged when a resolvedAtMsOverride is also supplied", () => {
    const state = createInitialState(scenario);
    const inputs = extractScoringInputs(scenario, state, { resolvedAtMsOverride: 5_000 });
    expect(inputs.resolvedAtMs).toBe(5_000);
    expect(inputs.finalNumericValues).toEqual({ errorRate: 0.1 });
    expect(inputs.finalStringValues).toEqual({ mode: "normal" });
  });

  it("reflects a changed string value after a rule transition", () => {
    const degradedScenario: ScenarioSimulationDefinition = {
      ...scenario,
      rules: [
        {
          id: "degraded",
          when: { triggerEquals: { active: true } },
          incidentState: "degraded",
          values: { errorRate: 5, mode: "degraded" },
          componentHealth: { svc: "degraded" },
        },
        scenario.rules[0]!,
      ],
      timedEvents: [
        { id: "start", atMs: 0, type: "TRIGGER_SET", message: "Incident begins.", setTriggers: { active: true } },
      ],
    };
    let state = createInitialState(degradedScenario);
    const result = simulate(degradedScenario, state, null, degradedScenario.tickMs);
    state = result.state;

    const inputs = extractScoringInputs(degradedScenario, state);
    expect(inputs.finalStringValues).toEqual({ mode: "degraded" });
    expect(inputs.finalNumericValues).toEqual({ errorRate: 5 });
  });
});
