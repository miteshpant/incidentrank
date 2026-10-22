import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

import ScenarioPracticePage from "./page";

describe("ScenarioPracticePage", () => {
  it("renders the practice console for a known free built-in scenario", async () => {
    const element = await ScenarioPracticePage({
      params: Promise.resolve({ slug: "database-connection-saturation" }),
    });
    render(element);

    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();
  });

  it("calls notFound for an unknown slug", async () => {
    await expect(
      ScenarioPracticePage({ params: Promise.resolve({ slug: "no-such-scenario" }) }),
    ).rejects.toThrow();
  });
});
