import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dbConnectionSaturation } from "@incidentrank/scenarios";
import { LockedScenarioScreen } from "./locked-scenario-screen";

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
