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

function setReasoning(text: string) {
  const field = screen.getByLabelText(/why are you making this change/i);
  fireEvent.change(field, { target: { value: text } });
}

function applyChanges() {
  fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));
}

function finishIncident() {
  fireEvent.click(screen.getByRole("button", { name: /^finish incident$/i }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /^finish incident$/i }));
}

beforeEach(() => {
  vi.useFakeTimers();
  // Default to signed-out. Guest attempts never hit /api/attempts
  // (creation/persistence), but DO request a stateless Finish-preview
  // evaluation once the candidate declares Finish — Payment Retry Storm
  // is candidate_declared (Phase 6.1), so it never auto-resolves/fails
  // via local state alone the way automatic scenarios used to; only a
  // confirmed Finish (or a true automatic failure) reaches a result view.
  // Stub fetch so the finish-preview request resolves instantly rather
  // than hitting the real network. Defaults to a "resolved"/"optimal"
  // outcome; tests that need a different outcome override this per-test.
  // See persistence.test.tsx for assertions on the finish-preview
  // request/response itself.
  mockAuthState.isSignedIn = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/finish-preview")) {
        return new Response(
          JSON.stringify({
            outcome: "resolved",
            completionTier: "optimal",
            score: { total: 965, breakdown: {}, maxPoints: {} },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ score: { total: 0, breakdown: {}, maxPoints: {} } }),
        { status: 200 },
      );
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Incident briefing", () => {
  it("shows a briefing screen before the incident begins", () => {
    render(<IncidentConsole />);

    expect(
      screen.getByRole("heading", { name: "Payment Retry Storm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /acknowledge incident/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/live metrics/i)).not.toBeInTheDocument();
  });
});

describe("Starting the incident", () => {
  it("starts the scenario clock after acknowledging", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    expect(screen.getByText(/live metrics/i)).toBeInTheDocument();
    expect(screen.getByText("99.9%")).toBeInTheDocument();
  });
});

describe("Architecture", () => {
  it("renders the expected architecture components", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    const architecture = screen
      .getByText(/system architecture/i)
      .closest("div")!;

    for (const label of [
      "API Gateway",
      "Checkout Service",
      "Payment Service",
      "External Payment Provider",
      "Postgres",
      "Kafka",
      "Settlement Worker",
    ]) {
      expect(within(architecture).getByText(label)).toBeInTheDocument();
    }
  });

  it("remains inspectable during the pre-incident countdown", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    fireEvent.click(screen.getByRole("button", { name: /kafka/i }));

    expect(screen.getByLabelText("Settlement Consumers")).toBeInTheDocument();
  });
});

describe("Component controls", () => {
  it("shows Payment Service controls by default", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    expect(screen.getByLabelText("Retries")).toBeInTheDocument();
    expect(screen.getByLabelText("Backoff")).toBeInTheDocument();
    expect(screen.getByLabelText("Circuit Breaker")).toBeInTheDocument();
    expect(screen.getByLabelText("Timeout")).toBeInTheDocument();
  });

  it("shows Kafka controls instead of Payment controls when Kafka is selected", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    fireEvent.click(screen.getByRole("button", { name: /kafka/i }));

    expect(screen.getByLabelText("Settlement Consumers")).toBeInTheDocument();
    expect(screen.queryByLabelText("Retries")).not.toBeInTheDocument();
  });
});

describe("Pre-incident countdown", () => {
  it("shows the initial countdown after acknowledging", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    expect(screen.getByText(/incident begins in 01:00/i)).toBeInTheDocument();
    expect(screen.getByText("PRE-INCIDENT")).toBeInTheDocument();
  });

  it("decreases as fake time advances", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    advanceSeconds(42);

    expect(screen.getByText(/incident begins in 00:18/i)).toBeInTheDocument();
  });

  it("locks Apply Changes until the incident begins", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    selectControl("Retries", "1");
    const applyButton = screen.getByRole("button", { name: /apply changes/i });

    expect(applyButton).toBeDisabled();
    expect(screen.getByText(/controls unlock when the incident begins/i)).toBeInTheDocument();
  });

  it("activates the incident and unlocks controls at T=60s", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    expect(screen.getByText("PRE-INCIDENT")).toBeInTheDocument();

    advanceSeconds(61);

    expect(screen.queryByText("PRE-INCIDENT")).not.toBeInTheDocument();
    expect(screen.queryByText(/incident begins in/i)).not.toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);

    selectControl("Retries", "1");
    expect(screen.getByRole("button", { name: /apply changes/i })).not.toBeDisabled();
  });
});

describe("Applying a configuration change", () => {
  it("calls the engine, updates state, and produces a YOU timeline event", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    const applyButton = screen.getByRole("button", { name: /apply changes/i });
    expect(applyButton).toBeDisabled();

    selectControl("Retries", "1");
    expect(applyButton).not.toBeDisabled();

    applyChanges();

    const timeline = screen.getByText(/incident timeline/i).closest("div")!;
    expect(within(timeline).getByText("You")).toBeInTheDocument();
    expect(
      within(timeline).getByText(/retries changed 3 → 1/i),
    ).toBeInTheDocument();
    expect(applyButton).toBeDisabled();
  });

  it("can be applied without entering reasoning", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    selectControl("Retries", "1");
    applyChanges();

    const timeline = screen.getByText(/incident timeline/i).closest("div")!;
    expect(
      within(timeline).getByText(/retries changed 3 → 1/i),
    ).toBeInTheDocument();
    expect(within(timeline).queryByText(/reason:/i)).not.toBeInTheDocument();
  });
});

describe("Candidate reasoning", () => {
  it("renders the reasoning field with editable controls", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    const field = screen.getByLabelText(/why are you making this change/i);
    expect(field).toBeInTheDocument();
    expect(field).not.toBeDisabled();
  });

  it("associates reasoning with the candidate action and shows it in the timeline", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    selectControl("Retries", "1");
    setReasoning(
      "Provider is degraded and retries appear to be amplifying traffic.",
    );
    applyChanges();

    const timeline = screen.getByText(/incident timeline/i).closest("div")!;
    expect(
      within(timeline).getByText(
        /provider is degraded and retries appear to be amplifying traffic/i,
      ),
    ).toBeInTheDocument();
  });

  it("clears the reasoning field after a successful apply", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    selectControl("Retries", "1");
    setReasoning("Reducing retry amplification.");
    applyChanges();

    const field = screen.getByLabelText(/why are you making this change/i);
    expect(field).toHaveValue("");
  });

  it("groups multiple configuration changes under one reasoning block", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);

    selectControl("Retries", "1");
    selectControl("Backoff", "exponential");
    setReasoning("Reduce retry amplification while spacing out requests.");
    applyChanges();

    const timeline = screen.getByText(/incident timeline/i).closest("div")!;
    const reasonMatches = within(timeline).getAllByText(
      /reduce retry amplification while spacing out requests/i,
    );
    expect(reasonMatches).toHaveLength(1);
    expect(
      within(timeline).getByText(/retries changed 3 → 1/i),
    ).toBeInTheDocument();
    expect(
      within(timeline).getByText(/backoff changed none → exponential/i),
    ).toBeInTheDocument();
  });
});

describe("Timed incident start", () => {
  it("degrades the system after 60 simulated seconds", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    expect(screen.getByText("99.9%")).toBeInTheDocument();

    advanceSeconds(61);

    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);
  });
});

describe("No answer feedback", () => {
  it("never renders correct/wrong-answer style feedback", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(61);
    selectControl("Retries", "5");
    applyChanges();

    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wrong answer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument();
  });
});

describe("Resolution", () => {
  it("reaches a resolved result view only after Finish Incident is confirmed, following a known good mitigation sequence", async () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    advanceSeconds(65);
    selectControl("Retries", "1");
    applyChanges();

    advanceSeconds(25);
    selectControl("Backoff", "exponential");
    applyChanges();

    advanceSeconds(30);
    selectControl("Circuit Breaker", "on");
    applyChanges();

    advanceSeconds(31);

    // Payment Retry Storm is candidate_declared (Phase 6.1): the engine's
    // success condition is now genuinely, continuously satisfied, but the
    // console must NOT reach a result view on its own.
    expect(
      screen.queryByText(/incident resolved/i, { selector: "span" }),
    ).not.toBeInTheDocument();

    finishIncident();
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("keeps candidate reasoning visible on the result screen", async () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    advanceSeconds(65);
    selectControl("Retries", "1");
    selectControl("Backoff", "exponential");
    setReasoning(
      "Provider is slow and retries seem to be worsening downstream pressure.",
    );
    applyChanges();

    advanceSeconds(30);
    selectControl("Circuit Breaker", "on");
    applyChanges();

    advanceSeconds(31);

    finishIncident();
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /provider is slow and retries seem to be worsening downstream pressure/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/retries/i).length).toBeGreaterThan(0);
  });
});

describe("Failure", () => {
  it("stays active (never auto-fails) after a known harmful configuration remains sustained past the old failure window", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    advanceSeconds(65);
    selectControl("Instances", "24");
    selectControl("Retries", "5");
    applyChanges();

    advanceSeconds(3 * 60 + 2);

    expect(
      screen.queryByText(/incident failed/i, { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^finish incident$/i }),
    ).toBeInTheDocument();
  });

  it("keeps a plausible but harmful explanation recorded without evaluating it, while the attempt stays active", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    advanceSeconds(65);
    selectControl("Instances", "24");
    selectControl("Retries", "5");
    setReasoning(
      "Scaling up payment instances and increasing retries should give the provider more chances to succeed.",
    );
    applyChanges();

    advanceSeconds(3 * 60 + 2);

    expect(
      screen.queryByText(/incident failed/i, { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument();
  });
});

describe("Try Again", () => {
  it("resets to a fresh briefing and initial state after an automatic failure (35-minute attempt ceiling)", () => {
    render(<IncidentConsole />);
    acknowledgeIncident();
    advanceSeconds(65);
    selectControl("Instances", "24");
    selectControl("Retries", "5");
    applyChanges();
    // The only automatic-failure trigger left is the uniform 35-minute
    // attempt ceiling (packages/simulator/src/tick.ts's
    // ATTEMPT_CEILING_MS) — sustaining a harmful configuration alone no
    // longer ends the attempt early, so this test must run the clock out
    // to the ceiling itself to reach a failed result view.
    advanceSeconds(35 * 60);

    expect(
      screen.getByText(/incident failed/i, { selector: "span" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(
      screen.getByRole("button", { name: /acknowledge incident/i }),
    ).toBeInTheDocument();

    acknowledgeIncident();
    expect(screen.getByText("99.9%")).toBeInTheDocument();
    expect(screen.getByLabelText("Retries")).toHaveValue("3");
    expect(screen.getByText(/incident begins in 01:00/i)).toBeInTheDocument();
  });
});

describe("Timer cleanup", () => {
  it("stops ticking once the incident resolves", async () => {
    render(<IncidentConsole />);
    acknowledgeIncident();

    advanceSeconds(65);
    selectControl("Retries", "1");
    applyChanges();
    advanceSeconds(25);
    selectControl("Backoff", "exponential");
    applyChanges();
    advanceSeconds(30);
    selectControl("Circuit Breaker", "on");
    applyChanges();
    advanceSeconds(31);

    finishIncident();
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();

    // The clock must not keep advancing simulation time once resolved —
    // running fake timers far forward should have no further effect.
    advanceSeconds(120);

    expect(
      screen.getByText(/incident resolved/i, { selector: "span" }),
    ).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the interval on unmount", () => {
    const { unmount } = render(<IncidentConsole />);
    acknowledgeIncident();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
