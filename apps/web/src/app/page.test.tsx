import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { mockAuthState } from "@/test/clerk-mock";
import HomePage from "./page";

describe("HomePage", () => {
  afterEach(() => {
    mockAuthState.isSignedIn = false;
  });

  it("renders the primary headline", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: /production is the test/i }),
    ).toBeInTheDocument();
  });

  it("renders the free-incident primary CTA", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /try a free incident/i })).toBeInTheDocument();
  });

  it("shows a secondary Create Account action for a signed-out visitor", () => {
    mockAuthState.isSignedIn = false;
    render(<HomePage />);

    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("does not show signup messaging for an already-authenticated visitor", () => {
    mockAuthState.isSignedIn = true;
    render(<HomePage />);

    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
  });

  it("does not use the removed 3-free-incidents framing", () => {
    render(<HomePage />);

    expect(screen.queryByText(/3 free incidents/i)).not.toBeInTheDocument();
  });

  it("renders the How it works section", () => {
    render(<HomePage />);

    expect(screen.getByText(/how it works/i)).toBeInTheDocument();
    expect(screen.getAllByText(/diagnose/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Stabilize")).toBeInTheDocument();
  });
});
