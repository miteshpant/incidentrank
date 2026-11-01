import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { analyticsEvents, createDb, users, type Db } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_USER = "test-account-delete-route-user";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Account Delete Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("POST /api/account/delete", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  afterEach(async () => {
    mockAuth.userId = null;
    // getOrCreateCurrentUser() fires a fire-and-forget signup_completed
    // analytics event the first time this route's auth mock creates a
    // fresh user row; analytics_events.userId has no FK to users (by
    // design, so real analytics survive account deletion), so without
    // this cleanup that row accumulates as permanent garbage every run.
    const anonymized = await testDb.query.users.findFirst({
      where: like(users.authProviderId, "anonymized_deleted-%"),
    });
    if (anonymized) {
      await testDb.delete(analyticsEvents).where(eq(analyticsEvents.userId, anonymized.id));
    }
    const notYetAnonymized = await testDb.query.users.findFirst({
      where: like(users.authProviderId, `${TEST_AUTH_USER}%`),
    });
    if (notYetAnonymized) {
      await testDb.delete(analyticsEvents).where(eq(analyticsEvents.userId, notYetAnonymized.id));
    }
    await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
    await testDb.delete(users).where(like(users.authProviderId, "anonymized_deleted-%"));
  });

  it("1. rejects an unauthenticated request", async () => {
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("2. deletes (anonymizes) the authenticated user's own account", async () => {
    mockAuth.userId = TEST_AUTH_USER;
    const response = await POST();
    expect(response.status).toBe(200);

    const reloaded = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_USER),
    });
    expect(reloaded).toBeUndefined(); // the original authProviderId no longer resolves
  });
});
