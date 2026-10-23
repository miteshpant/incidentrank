import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  // (automatic scenarios) or a finish-preview result (candidate_declared
  // scenarios, via Finish Incident) — stub fetch so these resolve
  // instantly rather than hitting the real network. The finish-preview
  // stub returns "resolved"/"optimal" unconditionally; tests that need a
  // different outcome override this per-test.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/finish-preview")) {
        return new Response(
          JSON.stringify({
            outcome: "resolved",
            completionTier: "optimal",
            score: { total: 965, breakdown: {} },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ score: { total: 0, breakdown: {} } }),
        { status: 200 },
      );
    }),
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

  it("Phase 6.1: reaches a resolved result view only after Finish Incident is confirmed, never automatically (candidate_declared scenario)", async () => {
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

    // The engine's own success condition is now genuinely, continuously
    // satisfied — but this scenario is candidate_declared, so the
    // console must NOT have reached a result view on its own.
    expect(
      screen.queryByText(/incident resolved/i, { selector: "span" }),
    ).not.toBeInTheDocument();

    const finishButton = screen.getByRole("button", { name: /^finish incident$/i });
    expect(finishButton).toBeEnabled();
    fireEvent.click(finishButton);

    // Confirmation dialog appears — a casual single click must not
    // immediately end the incident (docs/implementation_plan/
    // phase6.1.md's "Do not use a casual single-click destructive
    // action"). The dialog's own confirm button shares the trigger
    // button's accessible name, so scope the query to within the dialog.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const { getByRole } = within(dialog);
    fireEvent.click(getByRole("button", { name: /^finish incident$/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("Phase 6.1: declaring Finish before stabilizing shows a declared_unstable result, not a resolved one", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/finish-preview")) {
        return new Response(
          JSON.stringify({ outcome: "declared_unstable", completionTier: null, score: { total: 410, breakdown: {} } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ score: { total: 0, breakdown: {} } }), { status: 200 });
    });

    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );
    acknowledgeIncident();
    advanceSeconds(31);

    fireEvent.click(screen.getByRole("button", { name: /^finish incident$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^finish incident$/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/incident not fully stabilized/i, { selector: "span" }),
    ).toBeInTheDocument();
  });
});
