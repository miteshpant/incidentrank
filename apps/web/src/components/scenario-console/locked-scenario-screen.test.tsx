import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { dbConnectionSaturation } from "@incidentrank/scenarios";
import { LockedScenarioScreen } from "./locked-scenario-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("LockedScenarioScreen", () => {
  it("shows the scenario's own name/metadata and a discoverable, non-dead-end CTA", () => {
    render(<LockedScenarioScreen scenario={dbConnectionSaturation} />);

    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/paid/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to incidents/i })).toHaveAttribute(
      "href",
      "/incidents",
    );
  });

  it("never fakes a payment flow", () => {
    render(<LockedScenarioScreen scenario={dbConnectionSaturation} />);

    expect(screen.queryByRole("button", { name: /buy|purchase|upgrade now|checkout/i })).toBeNull();
  });

  it("shows candidate-safe skills and architecture topology, never rules or scoring", () => {
    render(<LockedScenarioScreen scenario={dbConnectionSaturation} />);

    for (const skill of dbConnectionSaturation.library!.skills) {
      expect(screen.getByText(skill)).toBeInTheDocument();
    }
    for (const node of dbConnectionSaturation.simulation.architecture.nodes) {
      expect(screen.getByText(node.label)).toBeInTheDocument();
    }
  });
});

describe("LockedScenarioScreen — Phase 8 Incident Pass states", () => {
  it("shows the default 'coming soon' copy with no access reason", () => {
    render(<LockedScenarioScreen scenario={dbConnectionSaturation} />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use incident pass/i })).toBeNull();
  });

  it("shows the 'Use Incident Pass' affordance when a pass is available", () => {
    render(
      <LockedScenarioScreen
        scenario={dbConnectionSaturation}
        access={{ allowed: false, reason: "incident_pass_available", passState: "available" }}
        availablePassId="test-pass-id"
      />,
    );

    expect(screen.getByText(/available incident pass/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use incident pass/i })).toBeInTheDocument();
  });

  it("the confirmation dialog shows the exact required warning copy before binding", () => {
    render(
      <LockedScenarioScreen
        scenario={dbConnectionSaturation}
        access={{ allowed: false, reason: "incident_pass_available", passState: "available" }}
        availablePassId="test-pass-id"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /use incident pass/i }));

    expect(
      screen.getByText(/once selected, this pass can't be moved to another incident/i),
    ).toBeInTheDocument();
  });

  it("shows the 'bound elsewhere' copy without any bind affordance", () => {
    render(
      <LockedScenarioScreen
        scenario={dbConnectionSaturation}
        access={{ allowed: false, reason: "incident_pass_bound_elsewhere" }}
      />,
    );

    expect(screen.getByText(/already assigned to another scenario/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use incident pass/i })).toBeNull();
  });
});
