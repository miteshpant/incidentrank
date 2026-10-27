import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

import { mockAuthState } from "@/test/clerk-mock";
import { IncidentConsole } from "./incident-console";

function advanceSeconds(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

function acknowledgeIncident() {
  fireEvent.click(screen.getByRole("button", { name: /acknowledge incident/i }));
}

function selectControl(controlLabel: string, optionText: string) {
  const select = screen.getByLabelText(controlLabel);
  fireEvent.change(select, { target: { value: optionText } });
}

function applyChanges() {
  fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));
}

function finishIncident() {
  fireEvent.click(screen.getByRole("button", { name: /^finish incident$/i }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /^finish incident$/i }));
}

const FAKE_ATTEMPT_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.useFakeTimers();
  mockAuthState.isSignedIn = true;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/attempts?scenarioSlug=")) {
        // No in-progress attempt to resume — the resume lookup this
        // console now performs on mount (Phase 7.3) should find nothing
        // for a fresh test render, falling through to the normal
        // briefing/acknowledge flow these tests exercise.
        return new Response(JSON.stringify({ attempt: null }), { status: 200 });
      }

      if (url === "/api/attempts") {
        return new Response(
          JSON.stringify({ attempt: { id: FAKE_ATTEMPT_ID } }),
          { status: 200 },
        );
      }

      if (url === "/api/attempts/score-preview" || url.endsWith("/complete")) {
        return new Response(
          JSON.stringify({
            score: {
              total: 742,
              breakdown: {
                recovery: 200,
                customerImpact: 150,
                dataIntegrity: 200,
                reliability: 100,
                costEfficiency: 72,
                operationalEfficiency: 20,
              },
            },
          }),
          { status: 200 },
        );
      }

      // Payment Retry Storm is candidate_declared (Phase 6.1): a
      // confirmed Finish Incident requests the real completion
      // decision — /finish for a persisted (signed-in) attempt,
      // /finish-preview for an anonymous one. Both share the same
      // response shape as /complete above, just reached via Finish
      // rather than automatic engine detection.
      if (url.endsWith("/finish") || url === "/api/attempts/finish-preview") {
        return new Response(
          JSON.stringify({
            outcome: "resolved",
            completionTier: "optimal",
            score: {
              total: 742,
              breakdown: {
                recovery: 200,
                customerImpact: 150,
                dataIntegrity: 200,
                reliability: 100,
                costEfficiency: 72,
                operationalEfficiency: 20,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Attempt persistence (signed in)", () => {
  it("creates an attempt record when the incident is acknowledged", async () => {
    render(<IncidentConsole />);
    await act(async () => {
      await Promise.resolve();
    });
    acknowledgeIncident();

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/attempts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scenarioSlug: "payment-retry-storm" }),
      }),
    );
  });

  it("persists an action group after a successful apply", async () => {
    render(<IncidentConsole />);
    await act(async () => {
      await Promise.resolve();
    });
    acknowledgeIncident();

    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(65);
    selectControl("Retries", "1");
    applyChanges();

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      `/api/attempts/${FAKE_ATTEMPT_ID}/action-groups`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("persists the terminal result through Finish Incident when the candidate declares the incident resolved", async () => {
    render(<IncidentConsole />);
    await act(async () => {
      await Promise.resolve();
    });
    acknowledgeIncident();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(65);
    selectControl("Retries", "1");
    applyChanges();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(25);
    selectControl("Backoff", "exponential");
    applyChanges();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(30);
    selectControl("Circuit Breaker", "on");
    applyChanges();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(31);
    await act(async () => {
      await Promise.resolve();
    });

    // Payment Retry Storm is candidate_declared (Phase 6.1): the success
    // condition is now genuinely, continuously satisfied, but persistence
    // only happens once the candidate explicitly confirms Finish — never
    // automatically via /complete.
    finishIncident();
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      `/api/attempts/${FAKE_ATTEMPT_ID}/finish`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      `/api/attempts/${FAKE_ATTEMPT_ID}/complete`,
      expect.anything(),
    );
  });
});

describe("Guest play (signed out)", () => {
  it("never calls the attempts API before the incident resolves", async () => {
    mockAuthState.isSignedIn = false;
    render(<IncidentConsole />);
    acknowledgeIncident();

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests a stateless finish-preview evaluation (never /api/attempts) once Finish Incident is confirmed", async () => {
    mockAuthState.isSignedIn = false;
    render(<IncidentConsole />);
    acknowledgeIncident();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(65);
    selectControl("Retries", "1");
    applyChanges();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(25);
    selectControl("Backoff", "exponential");
    applyChanges();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(30);
    selectControl("Circuit Breaker", "on");
    applyChanges();
    await act(async () => {
      await Promise.resolve();
    });

    advanceSeconds(31);
    await act(async () => {
      await Promise.resolve();
    });

    // Payment Retry Storm is candidate_declared (Phase 6.1): a guest's
    // automatic-resolve path never fires; only a confirmed Finish
    // requests the real (stateless) completion evaluation.
    finishIncident();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/attempts/finish-preview",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"scenarioSlug":"payment-retry-storm"'),
      }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/attempts",
      expect.anything(),
    );

    expect(screen.getByText("742")).toBeInTheDocument();
  });
});
