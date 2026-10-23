import { describe, expect, it } from "vitest";
import { reviewAttempt } from "./review";
import type { ReplayActionGroup } from "./replay";
import type { ScenarioSimulationDefinition } from "./types";

/**
 * Minimal fixture modeled on Payment Retry Storm's shape (provider
 * degrades at T=60s), extended with authored feedback on the
 * classification rules — Phase 6.1's "Post-Incident Practice
 * Explanation" requirement. retries<=1 is only beneficial once
 * providerDegraded is true, so this fixture also proves feedback
 * resolves against triggers AT THE TIME the action was applied, never
 * against final state.
 */
const scenario: ScenarioSimulationDefinition = {
  tickMs: 1000,
  architecture: { nodes: [], edges: [] },
  controls: [
    { key: "retries", allowedValues: [0, 1, 3, 5], initialValue: 3 },
    { key: "concurrency", allowedValues: [1, 2, 4], initialValue: 1 },
  ],
  initialValues: { errorRate: 0.1 },
  initialComponentHealth: {},
  severityFields: [],
  numericWatchFields: [],
  timedEvents: [
    {
      id: "provider-degraded",
      atMs: 60_000,
      type: "TRIGGER_SET",
      message: "Provider degraded.",
      setTriggers: { providerDegraded: true },
    },
  ],
  rules: [
    {
      id: "recovering",
      when: { triggerEquals: { providerDegraded: true }, controlAtMost: { retries: 1 } },
      incidentState: "recovering",
      values: { errorRate: 0.2 },
      componentHealth: {},
    },
    {
      id: "degraded-default",
      when: { triggerEquals: { providerDegraded: true } },
      incidentState: "degraded",
      values: { errorRate: 10 },
      componentHealth: {},
    },
    {
      id: "healthy-default",
      when: {},
      incidentState: "healthy",
      values: { errorRate: 0.1 },
      componentHealth: {},
    },
  ],
  revenueLossRatePerMinute: { degraded: 500, recovering: 0, healthy: 0 },
  infrastructureCost: { baselineMonthlyUsd: 100, perUnitMonthlyUsd: {} },
  successCondition: {
    conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }],
    sustainedSeconds: 10,
  },
  failureCondition: {
    conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }],
    sustainedSeconds: 30,
  },
  actionClassifications: [
    {
      id: "retries-low-beneficial-once-degraded",
      controlKey: "retries",
      valueAtMost: 1,
      whenTriggerEquals: { providerDegraded: true },
      outcome: "beneficial",
      feedback: {
        title: "Reduced retry amplification",
        explanation: "Lowering retries reduced pressure on the degraded provider.",
      },
    },
    {
      // No feedback authored for this rule at all — missing is valid.
      controlKey: "concurrency",
      valueAtLeast: 4,
      outcome: "harmful",
    },
  ],
};

describe("reviewAttempt", () => {
  it("attaches the matched rule's authored feedback to the resulting change", () => {
    const actionGroups: ReplayActionGroup[] = [
      { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
    ];
    const result = reviewAttempt(scenario, actionGroups, 70_000);

    expect(result.actionGroups).toHaveLength(1);
    const change = result.actionGroups[0]!.changes[0]!;
    expect(change.outcome).toBe("beneficial");
    expect(change.feedback).toEqual({
      title: "Reduced retry amplification",
      explanation: "Lowering retries reduced pressure on the degraded provider.",
    });
  });

  it("resolves feedback against the triggers active AT THE TIME of the action, not final state", () => {
    // retries<=1 applied BEFORE providerDegraded fires (at 60s) — the
    // whenTriggerEquals-gated rule does not match at this moment, even
    // though providerDegraded is eventually true later in the attempt.
    const actionGroups: ReplayActionGroup[] = [
      { elapsedMs: 30_000, changes: [{ controlKey: "retries", value: 1 }] },
    ];
    const result = reviewAttempt(scenario, actionGroups, 35_000);

    const change = result.actionGroups[0]!.changes[0]!;
    expect(change.outcome).toBe("neutral");
    expect(change.feedback).toBeNull();
  });

  it("missing feedback on a matched rule is valid — null, not a fabricated default", () => {
    const actionGroups: ReplayActionGroup[] = [
      { elapsedMs: 10_000, changes: [{ controlKey: "concurrency", value: 4 }] },
    ];
    const result = reviewAttempt(scenario, actionGroups, 15_000);

    const change = result.actionGroups[0]!.changes[0]!;
    expect(change.outcome).toBe("harmful");
    expect(change.feedback).toBeNull();
  });

  it("reaches the same final state as an uninterrupted simulate() loop would", () => {
    const actionGroups: ReplayActionGroup[] = [
      { elapsedMs: 65_000, changes: [{ controlKey: "retries", value: 1 }] },
    ];
    const result = reviewAttempt(scenario, actionGroups, 66_000);

    expect(result.state.values.errorRate).toBe(0.2);
    expect(result.state.simulationTimeMs).toBe(66_000);
  });

  it("preserves original action-group elapsedMs and change order even when multiple changes share a group", () => {
    const actionGroups: ReplayActionGroup[] = [
      {
        elapsedMs: 65_000,
        changes: [
          { controlKey: "retries", value: 1 },
          { controlKey: "concurrency", value: 4 },
        ],
      },
    ];
    const result = reviewAttempt(scenario, actionGroups, 70_000);

    expect(result.actionGroups[0]!.elapsedMs).toBe(65_000);
    expect(result.actionGroups[0]!.changes.map((c) => c.controlKey)).toEqual([
      "retries",
      "concurrency",
    ]);
    expect(result.actionGroups[0]!.changes[0]!.feedback?.title).toBe(
      "Reduced retry amplification",
    );
    expect(result.actionGroups[0]!.changes[1]!.outcome).toBe("harmful");
  });
});
