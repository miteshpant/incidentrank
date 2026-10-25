import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

// next/headers' headers() only works inside a real Next.js request scope,
// which Vitest never provides when rendering a server component directly.
// Mutable per-test so the paid-scenario-gate tests below can simulate a
// request arriving on a non-localhost host, same approach dev-unlock.test.ts
// uses for the pure header-string predicate — this is the end-to-end
// counterpart, exercising the actual page component rather than the pure
// function in isolation. Scoped to this file only: a global next/headers
// mock could hide a real bug in some other route that legitimately
// depends on request headers.
let mockHost = "localhost:3000";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mockHost }),
}));

import ScenarioPracticePage from "./page";

describe("ScenarioPracticePage", () => {
  afterEach(() => {
    mockHost = "localhost:3000";
    vi.unstubAllEnvs();
  });

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

  /**
   * Regression coverage added during Phase 6C closeout: confirms the
   * page itself renders the LOCKED screen (not the playable incident
   * console) for a paid scenario when dev-unlock is off — the gap that
   * let the earlier Phase 6C QA pass go unnoticed as running under
   * DEV_UNLOCK_PAID_SCENARIOS=true. practice-access.test.ts already
   * covers the pure decision function; this exercises the real page.
   */
  describe("paid-scenario practice gate", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("shows the locked screen, not the incident console, for a paid scenario with dev-unlock unset", async () => {
      vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);
      const element = await ScenarioPracticePage({
        params: Promise.resolve({ slug: "rate-limit-misconfiguration" }),
      });
      render(element);

      expect(
        screen.getByRole("heading", { name: "Rate-Limit Misconfiguration" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/paid/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /acknowledge incident/i })).toBeNull();
    });

    it("shows the locked screen for a paid scenario even with dev-unlock true, when the request is not on localhost", async () => {
      vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");
      mockHost = "app.incidentrank.com";
      const element = await ScenarioPracticePage({
        params: Promise.resolve({ slug: "rate-limit-misconfiguration" }),
      });
      render(element);

      expect(screen.queryByRole("button", { name: /acknowledge incident/i })).toBeNull();
    });

    it("shows the playable console for a paid scenario when dev-unlock is true and the request is on localhost", async () => {
      vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");
      mockHost = "localhost:3000";
      const element = await ScenarioPracticePage({
        params: Promise.resolve({ slug: "rate-limit-misconfiguration" }),
      });
      render(element);

      expect(screen.getByRole("button", { name: /acknowledge incident/i })).toBeInTheDocument();
    });
  });
});
