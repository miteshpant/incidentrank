import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

import { mockAuthState } from "@/test/clerk-mock";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { GenericIncidentConsole } from "./generic-incident-console";

const entry = getBuiltInScenarioEntry(
  BUILT_IN_SCENARIO_CATALOG,
  "database-connection-saturation",
);
if (!entry) throw new Error("expected database-connection-saturation in the catalog");

function advanceSeconds(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

function acknowledgeIncident() {
  fireEvent.click(screen.getByRole("button", { name: /acknowledge incident/i }));
}

beforeEach(() => {
  vi.useFakeTimers();
  mockAuthState.isSignedIn = false;
  // Guest attempts request a stateless score preview once resolved/failed
  // (see use-incident-attempt.ts) — stub fetch so that request resolves
  // instantly rather than hitting the real network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ score: { total: 0, breakdown: {} } }),
        { status: 200 },
      ),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Task #21 (docs/implementation_plan/phase6.md): the generic practice
 * console, proven here against a second real built-in scenario
 * (Database Connection Saturation) rather than Payment Retry Storm — the
 * whole point of genericity is that this same component serves any
 * built-in scenario with zero scenario-specific code.
 */
describe("GenericIncidentConsole", () => {
  it("shows the scenario's own name and metadata on the briefing screen", () => {
    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/senior/i)).toBeInTheDocument();
  });

  it("shows candidate-safe detail/briefing preview fields: skills, architecture, free/paid status", () => {
    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );

    expect(screen.getByText("Free")).toBeInTheDocument();
    for (const skill of entry.definition.library!.skills) {
      expect(screen.getByText(skill)).toBeInTheDocument();
    }
    for (const node of entry.definition.simulation.architecture.nodes) {
      expect(screen.getByText(node.label)).toBeInTheDocument();
    }
  });

  it("starts the incident and shows the scenario's own architecture nodes", () => {
    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );

    acknowledgeIncident();

    expect(screen.getByText("Connection Pool")).toBeInTheDocument();
    expect(screen.getByText("Primary Database")).toBeInTheDocument();
  });

  it("reaches a resolved result view after scaling the pool and enabling the read replica", () => {
    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );
    acknowledgeIncident();

    advanceSeconds(31);
    fireEvent.click(screen.getByRole("button", { name: /^connection pool\b/i }));
    fireEvent.change(screen.getByLabelText("Connection Pool Size"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));

    fireEvent.click(screen.getByRole("button", { name: /^read replica\b/i }));
    fireEvent.change(screen.getByLabelText("Read Replica Enabled"), {
      target: { value: "true" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));

    advanceSeconds(16);

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();
  });
});
