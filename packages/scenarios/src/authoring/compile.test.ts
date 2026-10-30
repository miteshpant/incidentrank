import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { compileAuthoredScenario } from "./compile";
import { authoredScenarioToCandidateUI } from "./candidate-ui";
import { buildValidAuthoredScenario } from "./fixtures";

describe("compileAuthoredScenario — validation gate", () => {
  it("returns ok:false with structured errors for an invalid authored scenario", () => {
    const authored = buildValidAuthoredScenario({ rules: [] });
    const result = compileAuthoredScenario(authored);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("compileAuthoredScenario — compilation", () => {
  it("compiles a valid authored scenario to a simulator-compatible definition", () => {
    const result = compileAuthoredScenario(buildValidAuthoredScenario());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.definition.slug).toBe("db-connection-saturation-authored");
    expect(result.definition.simulation.controls).toHaveLength(2);
    expect(result.definition.simulation.rules).toHaveLength(3);
    expect(result.definition.simulation.initialValues.connectionUsage).toBe(40);
  });

  it("the compiled definition executes through the real simulator end to end", () => {
    const result = compileAuthoredScenario(buildValidAuthoredScenario());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let state = createInitialState(result.definition.simulation);
    const tickMs = result.definition.simulation.tickMs;

    for (let timeMs = 0; timeMs < 35_000; timeMs += tickMs) {
      const action: CandidateAction | null = null;
      state = simulate(result.definition.simulation, state, action, tickMs).state;
    }

    expect(state.triggers.saturating).toBe(true);
    expect(state.values.connectionUsage).toBe(98);
    expect(state.values.dbStatus).toBe("critical");
  });

  it("a candidate action classified by poolSize recovers the compiled scenario", () => {
    const result = compileAuthoredScenario(buildValidAuthoredScenario());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let state = createInitialState(result.definition.simulation);
    const tickMs = result.definition.simulation.tickMs;
    let actionApplied = false;

    for (let timeMs = 0; timeMs < 35_000; timeMs += tickMs) {
      let action: CandidateAction | null = null;
      if (timeMs >= 31_000 && !actionApplied) {
        action = { id: "a1", timestampMs: timeMs, controlKey: "poolSize", value: 200 };
        actionApplied = true;
      }
      state = simulate(result.definition.simulation, state, action, tickMs).state;
    }

    expect(state.values.dbStatus).toBe("normal");
    expect(state.values.connectionUsage).toBe(55);
  });
});

describe("compileAuthoredScenario — severity/watch/impact/action sections", () => {
  it("omitting the new sections still compiles to the prior empty/zeroed defaults", () => {
    const result = compileAuthoredScenario(buildValidAuthoredScenario());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.definition.simulation.severityFields).toEqual([]);
    expect(result.definition.simulation.numericWatchFields).toEqual([]);
    expect(result.definition.simulation.revenueLossRatePerMinute).toEqual({});
    expect(result.definition.simulation.infrastructureCost).toEqual({
      baselineMonthlyUsd: 0,
      perUnitMonthlyUsd: {},
    });
    expect(result.definition.simulation.actionClassifications).toEqual([]);
  });

  it("compiles authored severity fields, numeric watch fields, impact, and action classifications", () => {
    const authored = buildValidAuthoredScenario({
      severityFields: [
        {
          key: "dbStatus",
          announceCritical: {
            enteringType: "SEVERITY_CRITICAL",
            enteringMessage: "Postgres is critical.",
            recoveringType: "SEVERITY_RECOVERED",
            recoveringMessage: "Postgres has recovered.",
          },
        },
      ],
      numericWatchFields: [
        {
          key: "connectionUsage",
          trackPeak: true,
          threshold: {
            value: 90,
            enteringType: "THRESHOLD_CROSSED",
            enteringMessage: "Connection usage crossed 90%.",
            recoveringType: "THRESHOLD_RECOVERED",
            recoveringMessage: "Connection usage recovered below 90%.",
          },
        },
      ],
      impact: {
        revenueLossRatePerMinute: { saturated: 500 },
        infrastructureCost: {
          baselineMonthlyUsd: 1_000,
          perUnitMonthlyUsd: { "poolSize:200": 300 },
        },
      },
      actionClassifications: [
        {
          controlKey: "poolSize",
          valueAtLeast: 100,
          outcome: "beneficial",
        },
        {
          controlKey: "poolSize",
          valueAtMost: 50,
          whenTriggerEquals: { saturating: true },
          outcome: "harmful",
        },
      ],
    });

    const result = compileAuthoredScenario(authored);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.definition.simulation.severityFields).toEqual([
      {
        key: "dbStatus",
        announceCritical: {
          enteringType: "SEVERITY_CRITICAL",
          enteringMessage: "Postgres is critical.",
          recoveringType: "SEVERITY_RECOVERED",
          recoveringMessage: "Postgres has recovered.",
        },
      },
    ]);
    expect(result.definition.simulation.numericWatchFields).toEqual([
      {
        key: "connectionUsage",
        trackPeak: true,
        threshold: {
          value: 90,
          enteringType: "THRESHOLD_CROSSED",
          enteringMessage: "Connection usage crossed 90%.",
          recoveringType: "THRESHOLD_RECOVERED",
          recoveringMessage: "Connection usage recovered below 90%.",
        },
      },
    ]);
    expect(result.definition.simulation.revenueLossRatePerMinute).toEqual({ saturated: 500 });
    expect(result.definition.simulation.infrastructureCost).toEqual({
      baselineMonthlyUsd: 1_000,
      perUnitMonthlyUsd: { "poolSize:200": 300 },
    });
    expect(result.definition.simulation.actionClassifications).toEqual([
      { controlKey: "poolSize", valueAtLeast: 100, outcome: "beneficial" },
      {
        controlKey: "poolSize",
        valueAtMost: 50,
        whenTriggerEquals: { saturating: true },
        outcome: "harmful",
      },
    ]);
  });

  it("the compiled cost config computes monthly cost through the real engine", () => {
    const authored = buildValidAuthoredScenario({
      impact: {
        infrastructureCost: {
          baselineMonthlyUsd: 1_000,
          perUnitMonthlyUsd: { "poolSize:200": 300 },
        },
      },
    });
    const result = compileAuthoredScenario(authored);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let state = createInitialState(result.definition.simulation);
    const tickMs = result.definition.simulation.tickMs;
    expect(state.cost.currentMonthlyCostUsd).toBe(1_000);

    for (let timeMs = 0; timeMs < 32_000; timeMs += tickMs) {
      let action: CandidateAction | null = null;
      if (timeMs === 31_000) {
        action = { id: "a1", timestampMs: timeMs, controlKey: "poolSize", value: 200 };
      }
      state = simulate(result.definition.simulation, state, action, tickMs).state;
    }

    expect(state.cost.currentMonthlyCostUsd).toBe(1_300);
  });
});

describe("compileAuthoredScenario — Phase 10F backward compatibility", () => {
  it("defaults structure to linear when the authored document predates Phase 10F (no structure field in definitionJson)", () => {
    // buildValidAuthoredScenario() intentionally sets no structure/
    // domain/primarySkill/secondarySkills/kind/roleInIncident fields —
    // it represents every scenario_versions.definitionJson row persisted
    // before this phase shipped. compileAuthoredScenario must still
    // compile it to a valid ScenarioDefinition with structure: "linear",
    // the literal truth of every such scenario (none used
    // branching/parallel/cascading rule topology on purpose).
    const result = compileAuthoredScenario(buildValidAuthoredScenario());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.definition.structure).toBe("linear");
  });

  it("respects an explicitly authored structure instead of defaulting", () => {
    const base = buildValidAuthoredScenario();
    const authored = { ...base, basics: { ...base.basics, structure: "parallel" as const } };
    const result = compileAuthoredScenario(authored);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.definition.structure).toBe("parallel");
  });

  it("defaults every control's kind to remediation in the candidate UI descriptor when the authored document predates Phase 10F", () => {
    const authored = buildValidAuthoredScenario();
    const candidateUI = authoredScenarioToCandidateUI(authored);

    expect(candidateUI.controls.length).toBeGreaterThan(0);
    for (const control of candidateUI.controls) {
      expect(control.kind).toBe("remediation");
    }
  });
});

describe("compileAuthoredScenario — determinism", () => {
  it("produces repeatable results across two independent runs", () => {
    const resultA = compileAuthoredScenario(buildValidAuthoredScenario());
    const resultB = compileAuthoredScenario(buildValidAuthoredScenario());
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    if (!resultA.ok || !resultB.ok) return;

    let stateA = createInitialState(resultA.definition.simulation);
    let stateB = createInitialState(resultB.definition.simulation);
    const tickMs = resultA.definition.simulation.tickMs;

    for (let timeMs = 0; timeMs < 40_000; timeMs += tickMs) {
      let action: CandidateAction | null = null;
      if (timeMs === 32_000) {
        action = { id: "a1", timestampMs: timeMs, controlKey: "poolSize", value: 100 };
      }
      stateA = simulate(resultA.definition.simulation, stateA, action, tickMs).state;
      stateB = simulate(resultB.definition.simulation, stateB, action, tickMs).state;
    }

    expect(stateA).toEqual(stateB);
  });
});
