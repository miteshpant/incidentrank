import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { createDb, users, type Db } from "@incidentrank/db";
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
