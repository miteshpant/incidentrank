import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, users, attempts, incidentPasses, type Db } from "@incidentrank/db";
import { grantIncidentPass, bindIncidentPass } from "@/lib/server/incident-passes";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));

// This page now calls getOrCreateCurrentUser() (Phase 8: resolving pass
// state for the paid-scenario gate), which reaches @clerk/nextjs/server's
// auth() directly — a different module path than the client-side mock
// above. Most tests exercise the anonymous/signed-out visitor path,
// matching every other page test's mock of this module (see
// incidents/listing.test.tsx); the signed-in-user resume describe block
// below sets mockAuth.userId for its own tests and resets it afterward —
// a single top-level vi.mock (vs. a second, conflicting per-describe
// mock of the same module) per this file's established convention.
const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => (mockAuth.userId ? { fullName: "Resume Tester", username: null, primaryEmailAddress: null } : null),
}));

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

  /**
   * Phase 8 regression: live browser QA (QA-07) caught this page showing
   * "Pro — coming soon" on a refresh of an already-in-progress,
   * pass-funded paid-scenario attempt — once an attempt starts, its
   * funding pass is already "consumed" (not available/bound), so the
   * pass-state-only check locked out a legitimate resume. The identical
   * ordering bug was already fixed in POST /api/attempts/route.ts (see
   * "resuming (re-POSTing)..." in route.test.ts); this is the same fix
   * applied to the page route, which route.test.ts's coverage does not
   * reach because it never renders this server component.
   */
  describe("paid-scenario resume (signed-in user with an in-progress pass-funded attempt)", () => {
    const TEST_AUTH_ID = "test-page-resume-pass-funded";
    const PAID_SCENARIO_SLUG = "rate-limit-misconfiguration";
    let testDb: Db;

    beforeAll(() => {
      testDb = createDb();
    });

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);
      mockAuth.userId = TEST_AUTH_ID;
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      mockAuth.userId = null;
      await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
    });

    it("shows the playable console, not the locked screen, on refresh after the pass has been consumed", async () => {
      const [user] = await testDb
        .insert(users)
        .values({ authProviderId: TEST_AUTH_ID, displayName: "Resume Tester" })
        .returning();
      if (!user) throw new Error("user not created");

      const { getActiveScenarioBySlug } = await import("@/lib/server/scenario-registry");
      const scenarioRow = await getActiveScenarioBySlug(PAID_SCENARIO_SLUG);
      if (!scenarioRow) throw new Error("seed scenario missing — run pnpm db:seed");

      const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
      if (!pass) throw new Error("pass not granted");
      await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario: scenarioRow });

      // Simulate the pass already being consumed by a prior attempt-start
      // (mirrors consumeIncidentPass's effect without re-deriving its
      // transaction here) and that in-progress attempt existing.
      await testDb
        .update(incidentPasses)
        .set({ status: "consumed", consumedAt: new Date(0) })
        .where(eq(incidentPasses.id, pass.id));
      await testDb.insert(attempts).values({
        userId: user.id,
        scenarioId: scenarioRow.id,
        scenarioVersion: scenarioRow.version,
        attemptType: "practice",
        status: "in_progress",
        incidentPassId: pass.id,
      });

      const { default: ScenarioPracticePage } = await import("./page");
      const element = await ScenarioPracticePage({
        params: Promise.resolve({ slug: PAID_SCENARIO_SLUG }),
      });
      render(element);

      expect(screen.getByRole("button", { name: /acknowledge incident/i })).toBeInTheDocument();
      expect(screen.queryByText(/coming soon/i)).toBeNull();
    });
  });
});
