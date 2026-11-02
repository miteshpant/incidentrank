import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { mockAuthState } from "@/test/clerk-mock";
import HomePage from "./page";

/**
 * HomePage is now an async Server Component (it reads the active Weekly
 * Challenge, if any, via a real DB query) — React Testing Library's
 * render() cannot await an async component itself, so every test awaits
 * HomePage() first and renders the resolved element, matching the
 * pattern established in incidents/[slug]/page.test.tsx and
 * admin/layout.test.tsx.
 */
describe("HomePage", () => {
  afterEach(() => {
    mockAuthState.isSignedIn = false;
  });

  it("renders the primary headline", async () => {
    render(await HomePage());

    expect(
      screen.getByRole("heading", { name: /production is the test/i }),
    ).toBeInTheDocument();
  });

  it("renders the free-incident primary CTA", async () => {
    render(await HomePage());

    expect(screen.getByRole("link", { name: /try a free incident/i })).toBeInTheDocument();
  });

  it("shows a secondary Create Account action for a signed-out visitor", async () => {
    mockAuthState.isSignedIn = false;
    render(await HomePage());

    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("does not show signup messaging for an already-authenticated visitor", async () => {
    mockAuthState.isSignedIn = true;
    render(await HomePage());

    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
  });

  it("does not use the removed 3-free-incidents framing", async () => {
    render(await HomePage());

    expect(screen.queryByText(/3 free incidents/i)).not.toBeInTheDocument();
  });

  it("renders the How it works section", async () => {
    render(await HomePage());

    expect(screen.getByText(/how it works/i)).toBeInTheDocument();
    expect(screen.getAllByText(/diagnose/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Stabilize")).toBeInTheDocument();
  });
});
