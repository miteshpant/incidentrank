import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the primary headline", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: /production is the test/i }),
    ).toBeInTheDocument();
  });
});
