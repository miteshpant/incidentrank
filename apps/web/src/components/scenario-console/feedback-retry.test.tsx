import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { GenericIncidentConsole } from "./generic-incident-console";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

import { mockAuthState } from "@/test/clerk-mock";

/**
 * Phase 6B.1 regression test: the post-incident feedback fetch
 * (requestActionFeedback -> GET /api/attempts/:id/review) used to
 * silently swallow a 409 ("this attempt has not finished yet") forever
 * — a real race between the client's local terminal-phase transition
 * and the server's own async terminal-attempt persistence write. A
 * candidate would see no feedback at all, indistinguishable from "this
 * attempt legitimately has none." result-screen.tsx now retries a
 * bounded number of times specifically on 409.
 *
 * Uses a real built-in scenario (Database Connection Saturation, same
 * fixture as generic-incident-console.test.tsx's candidate_declared
 * Finish coverage) so there is a genuine candidate action group for the
 * returned feedback to attach to by elapsedMs.
 */
const entry = getBuiltInScenarioEntry(
  BUILT_IN_SCENARIO_CATALOG,
  "database-connection-saturation",
);
if (!entry) throw new Error("expected database-connection-saturation in the catalog");

function acknowledgeIncident() {
  fireEvent.click(screen.getByRole("button", { name: /acknowledge incident/i }));
}

function advanceSeconds(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe("Post-incident feedback retry after a 409 (terminal-persistence race)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockAuthState.isSignedIn = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries the review fetch on 409 and eventually renders the authored feedback instead of staying empty forever", async () => {
    let reviewCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("/api/attempts?scenarioSlug=")) {
          return new Response(JSON.stringify({ attempt: null }), { status: 200 });
        }

        if (url === "/api/attempts") {
          return new Response(JSON.stringify({ attempt: { id: "attempt-fixture-1" } }), {
            status: 200,
          });
        }

        if (url.includes("/finish")) {
          return new Response(
            JSON.stringify({
              outcome: "resolved",
              completionTier: "optimal",
              score: { total: 965, breakdown: {}, maxPoints: {} },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/review")) {
          reviewCallCount += 1;
          if (reviewCallCount === 1) {
            // The exact race this fix targets: the client is already on
            // the result phase, but the server hasn't persisted the
            // terminal attempt state yet.
            return new Response(
              JSON.stringify({ error: "This attempt has not finished yet." }),
              { status: 409 },
            );
          }
          return new Response(
            JSON.stringify({
              actionGroups: [
                {
                  elapsedMs: 31_000,
                  changes: [
                    {
                      controlKey: "poolSize",
                      previousValue: 20,
                      newValue: 200,
                      outcome: "beneficial",
                      feedback: { title: "Fixture feedback title", explanation: "Fixture explanation." },
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    acknowledgeIncident();
    advanceSeconds(31);

    fireEvent.click(screen.getByRole("button", { name: /^connection pool\b/i }));
    fireEvent.change(screen.getByLabelText("Connection Pool Size"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));

    fireEvent.click(screen.getByRole("button", { name: /^finish incident$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^finish incident$/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();

    // First review fetch already fired on mount and hit the 409 above.
    // Let the bounded retry's setTimeout(..., 500ms) fire, then let the
    // resulting fetch's promise chain resolve.
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviewCallCount).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Fixture feedback title")).toBeInTheDocument();
  });

  it("does not retry on a non-409 error (e.g. a genuinely ineligible attempt) — stays silent, matching prior behavior", async () => {
    let reviewCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("/api/attempts?scenarioSlug=")) {
          return new Response(JSON.stringify({ attempt: null }), { status: 200 });
        }

        if (url === "/api/attempts") {
          return new Response(JSON.stringify({ attempt: { id: "attempt-fixture-2" } }), {
            status: 200,
          });
        }

        if (url.includes("/finish")) {
          return new Response(
            JSON.stringify({
              outcome: "resolved",
              completionTier: "optimal",
              score: { total: 965, breakdown: {}, maxPoints: {} },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/review")) {
          reviewCallCount += 1;
          // 403: "Post-incident feedback is only available for practice
          // attempts" — a real, permanent error, never transient.
          return new Response(
            JSON.stringify({ error: "Post-incident feedback is only available for practice attempts." }),
            { status: 403 },
          );
        }

        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <GenericIncidentConsole
        scenario={entry.definition}
        simulation={entry.definition.simulation}
        candidateUI={entry.candidateUI}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    acknowledgeIncident();
    advanceSeconds(31);

    fireEvent.click(screen.getByRole("button", { name: /^finish incident$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^finish incident$/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviewCallCount).toBe(1);
  });
});
