import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import type { ScenarioDefinition } from "@incidentrank/scenarios";
import { GenericIncidentConsole } from "./generic-incident-console";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

import { mockAuthState } from "@/test/clerk-mock";

/**
 * Minimal fixture whose failure condition is satisfied the instant the
 * incident starts. The only automatic-failure trigger in the engine is
 * now the uniform 35-minute attempt ceiling (packages/simulator/src/
 * tick.ts's ATTEMPT_CEILING_MS) — sustaining a breached failureCondition
 * no longer ends an attempt on its own, so this test advances fake
 * timers past that ceiling to reach a genuine automatic failure.
 * Exercises the AUTOMATIC-failure score-fetch path
 * (completeAttemptRecord/requestScorePreview via
 * use-incident-attempt.ts's terminal-completion effects). Per the Phase
 * 7.1 doctrine the engine can only ever auto-detect FAILURE — a
 * sustainedSeconds: 0 success condition (this fixture's original shape)
 * is no longer reachable automatically at all, so this regression now
 * exercises failure, the one terminal state that remains genuinely
 * automatic and still needs this exact score-fetch-retry path tested.
 */
const simulation: ScenarioSimulationDefinition = {
  tickMs: 1_000,
  architecture: { nodes: [{ id: "svc", label: "Service" }], edges: [] },
  controls: [],
  initialValues: { errorRate: 60 },
  initialComponentHealth: { svc: "critical" },
  severityFields: [],
  numericWatchFields: [],
  timedEvents: [
    {
      id: "start",
      atMs: 0,
      type: "TRIGGER_SET",
      message: "Incident begins.",
      setTriggers: { active: true },
    },
  ],
  rules: [
    {
      id: "already-critical",
      when: { triggerEquals: { active: true } },
      incidentState: "critical",
      values: { errorRate: 60 },
      componentHealth: { svc: "critical" },
    },
  ],
  revenueLossRatePerMinute: { healthy: 0, critical: 100 },
  infrastructureCost: { baselineMonthlyUsd: 100, perUnitMonthlyUsd: {} },
  successCondition: {
    conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }],
    sustainedSeconds: 60,
  },
  failureCondition: {
    conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }],
    sustainedSeconds: 0,
  },
  actionClassifications: [],
};

const scenario: ScenarioDefinition = {
  id: "fixture-scoring-retry",
  slug: "fixture-scoring-retry",
  version: 1,
  name: "Scoring Retry Fixture",
  description: "A minimal fixture scenario for the scoring-retry regression test.",
  difficulty: "beginner",
  estimatedMinutes: 1,
  isFree: true,
  structure: "linear",
  simulation,
};

const candidateUI = { metrics: [], controls: [], components: [] };

function acknowledgeIncident() {
  fireEvent.click(screen.getByRole("button", { name: /acknowledge incident/i }));
}

function advanceSeconds(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe("Scoring retry after a failed score-preview request (automatic-failure terminal scoring)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockAuthState.isSignedIn = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a retry affordance instead of stalling forever when the score-preview request fails, and recovers on retry", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          // First request fails outright — the exact case that used to
          // leave serverScore null forever with completionSent latched
          // true and no visible error.
          return new Response(null, { status: 500 });
        }
        return new Response(
          JSON.stringify({ score: { total: 950, breakdown: {}, maxPoints: {} } }),
          { status: 200 },
        );
      }),
    );

    render(
      <GenericIncidentConsole scenario={scenario} simulation={simulation} candidateUI={candidateUI} />,
    );
    acknowledgeIncident();

    // The failure condition is satisfied from the first tick, but the
    // engine only ever auto-fails via the uniform 35-minute attempt
    // ceiling now — advance past it to reach a genuine automatic failure.
    advanceSeconds(35 * 60);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(/couldn't load your score/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^950$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/^950$/)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load your score/i)).not.toBeInTheDocument();
    expect(callCount).toBe(2);
  });

  it("renders each dimension's score denominator from the server-provided maxPoints, never a hardcoded client constant (Phase 10G)", async () => {
    // A deliberately non-standard maxPoints split — if the result screen
    // still had its own hardcoded SCORE_DIMENSION_MAX (the Phase 10F
    // "150 / 50" bug), this would render the wrong denominator despite
    // the server sending the correct one.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            score: {
              total: 321,
              breakdown: { recovery: 111, operationalEfficiency: 22 },
              maxPoints: { recovery: 333, operationalEfficiency: 44 },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <GenericIncidentConsole scenario={scenario} simulation={simulation} candidateUI={candidateUI} />,
    );
    acknowledgeIncident();
    advanceSeconds(35 * 60);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/111 \/ 333/)).toBeInTheDocument();
    expect(screen.getByText(/22 \/ 44/)).toBeInTheDocument();
    // The old hardcoded constants (300 for recovery, 50 for
    // operationalEfficiency) must never appear instead.
    expect(screen.queryByText(/111 \/ 300/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22 \/ 50/)).not.toBeInTheDocument();
  });
});
