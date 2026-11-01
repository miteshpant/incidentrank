import { render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { adminUsers, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";

vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/scenarios" }));

let clerkUserId: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerkUserId }),
  currentUser: async () => ({
    fullName: "Admin Layout Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

const TEST_AUTH_ADMIN = "test-admin-layout-admin";
const TEST_AUTH_NON_ADMIN = "test-admin-layout-non-admin";

/**
 * Regression coverage for a real info-disclosure bug: AdminLayout used to
 * render AdminNav (every admin section's name — Stripe Subscriptions,
 * Webhook Events, Founding Allocations, etc.) unconditionally, before any
 * per-page loadAdminMembership() gate ran. No actual admin DATA ever
 * leaked (each page's own inline gate still correctly blocked that), but
 * the admin surface's structure was visible to any signed-out or
 * non-admin visitor. The layout now independently decides whether to
 * render the nav at all.
 */
describe("AdminLayout", () => {
  let testDb: Db;

  beforeAll(async () => {
    testDb = createDb();
  });

  afterEach(async () => {
    clerkUserId = null;
    vi.unstubAllEnvs();
    for (const authId of [TEST_AUTH_ADMIN, TEST_AUTH_NON_ADMIN]) {
      const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
      if (user) {
        await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
      }
      await testDb.delete(users).where(eq(users.authProviderId, authId));
    }
  });

  afterAll(async () => {
    await testDb.$client.end({ timeout: 1 });
  });

  it("does not render the admin nav for a signed-out visitor", async () => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
    clerkUserId = null;
    const { default: AdminLayout } = await import("./layout");

    render(await AdminLayout({ children: <div>content</div> }));

    expect(screen.queryByText("Scenarios")).not.toBeInTheDocument();
    expect(screen.queryByText("Stripe Subscriptions")).not.toBeInTheDocument();
    expect(screen.queryByText("Webhook Events")).not.toBeInTheDocument();
  });

  it("does not render the admin nav for a signed-in user with no admin membership", async () => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
    await testDb.insert(users).values({ authProviderId: TEST_AUTH_NON_ADMIN, displayName: "Not Admin" });
    clerkUserId = TEST_AUTH_NON_ADMIN;
    const { default: AdminLayout } = await import("./layout");

    render(await AdminLayout({ children: <div>content</div> }));

    expect(screen.queryByText("Scenarios")).not.toBeInTheDocument();
  });

  it("renders the admin nav for an active admin", async () => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ADMIN, displayName: "Real Admin" })
      .returning();
    if (!user) throw new Error("user not created");
    await testDb.insert(adminUsers).values({ userId: user.id, role: "admin" });
    clerkUserId = TEST_AUTH_ADMIN;
    const { default: AdminLayout } = await import("./layout");

    render(await AdminLayout({ children: <div>content</div> }));

    expect(screen.getByText("Scenarios")).toBeInTheDocument();
  });

  it("always renders children regardless of admin status (e.g. the invite-acceptance page)", async () => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
    clerkUserId = null;
    const { default: AdminLayout } = await import("./layout");

    render(await AdminLayout({ children: <div>invite content</div> }));

    expect(screen.getByText("invite content")).toBeInTheDocument();
  });
});
