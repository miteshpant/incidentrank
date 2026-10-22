import { act, fireEvent, render, screen } from "@testing-library/react";
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

const FAKE_ATTEMPT_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.useFakeTimers();
  mockAuthState.isSignedIn = true;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

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

  it("persists the terminal result when the incident resolves", async () => {
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

    expect(fetch).toHaveBeenCalledWith(
      `/api/attempts/${FAKE_ATTEMPT_ID}/complete`,
      expect.objectContaining({ method: "POST" }),
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

  it("requests a stateless score preview (never /api/attempts) once the incident resolves", async () => {
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
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/attempts/score-preview",
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
