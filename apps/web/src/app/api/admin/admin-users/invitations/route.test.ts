import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, users, adminUsers, adminInvites, type Db } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_OWNER = "test-admin-invite-route-owner";
const TEST_AUTH_NON_ADMIN = "test-admin-invite-route-non-admin";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Admin Invite Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("POST /api/admin/admin-users/invitations", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockAuth.userId = null;
    await testDb.delete(adminInvites).where(eq(adminInvites.email, "new-admin@incidentrank.com"));
    for (const authId of [TEST_AUTH_OWNER, TEST_AUTH_NON_ADMIN]) {
      const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
      if (user) {
        await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
      }
    }
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_NON_ADMIN));
  });

  function buildRequest(email: string, role: string) {
    return new Request("http://internal/api/admin/admin-users/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
  }

  it("a non-admin cannot create an admin invitation", async () => {
    mockAuth.userId = TEST_AUTH_NON_ADMIN;
    await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_NON_ADMIN, displayName: "Non Admin" });

    const response = await POST(buildRequest("new-admin@incidentrank.com", "admin"));
    expect(response.status).toBe(403);
  });

  it("an active admin can create an invitation for an @incidentrank.com email", async () => {
    mockAuth.userId = TEST_AUTH_OWNER;
    const [owner] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
      .returning();
    if (!owner) throw new Error("owner not created");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });

    const response = await POST(buildRequest("new-admin@incidentrank.com", "admin"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.token).toBe("string");
  });

  it("rejects a non-@incidentrank.com email even from an active owner", async () => {
    mockAuth.userId = TEST_AUTH_OWNER;
    const [owner] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
      .returning();
    if (!owner) throw new Error("owner not created");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });

    const response = await POST(buildRequest("someone@gmail.com", "admin"));
    expect(response.status).toBe(400);
  });
});
