import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
  currentUser: async () => null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { createDb, type Db } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { LibraryContent } from "./page";

let testDb: Db;

beforeAll(() => {
  testDb = createDb();
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

/**
 * Task #22 (docs/implementation_plan/phase6.md's "Scenario Library
 * Page"): full-page integration smoke test, signed out — confirms every
 * public catalog scenario is listed and organization-owned scenarios
 * (never present in BUILT_IN_SCENARIO_CATALOG) are impossible to surface
 * here by construction. See library-browser.test.tsx for filter/search/
 * sort unit coverage.
 */
describe("IncidentsPage library content", () => {
  it("lists every public built-in scenario with a working CTA", async () => {
    const element = await LibraryContent();
    render(element);

    expect(
      screen.getByRole("heading", { name: "Payment Retry Storm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Database Connection Saturation" }),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /start incident/i });
    expect(links.some((link) => link.getAttribute("href") === `/incidents/${paymentRetryStorm.slug}`)).toBe(
      true,
    );
  });

  it("never shows a signed-out practice-progress indicator", async () => {
    const element = await LibraryContent();
    render(element);

    expect(screen.queryByText(/not attempted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^best:/i)).not.toBeInTheDocument();
  });
});
