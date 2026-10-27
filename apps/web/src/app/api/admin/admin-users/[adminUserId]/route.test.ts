import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, users, adminUsers, type Db } from "@incidentrank/db";
import type { DELETE as DeleteHandler } from "./route";

const TEST_AUTH_OWNER = "test-admin-revoke-route-owner";
const TEST_AUTH_ADMIN = "test-admin-revoke-route-admin";
const TEST_AUTH_OTHER_OWNER = "test-admin-revoke-route-other-owner";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Admin Revoke Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("DELETE /api/admin/admin-users/[adminUserId]", () => {
  let testDb: Db;
  let DELETE: typeof DeleteHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ DELETE } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockAuth.userId = null;
    for (const authId of [TEST_AUTH_OWNER, TEST_AUTH_ADMIN, TEST_AUTH_OTHER_OWNER]) {
      const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
      if (user) {
        await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
      }
    }
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ADMIN));
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER_OWNER));
  });

  async function createUser(authProviderId: string, displayName: string) {
    const [user] = await testDb.insert(users).values({ authProviderId, displayName }).returning();
    if (!user) throw new Error("user not created");
    return user;
  }

  function buildRequest(adminUserId: string) {
    return {
      request: new Request(`http://internal/api/admin/admin-users/${adminUserId}`, {
        method: "DELETE",
      }),
      params: Promise.resolve({ adminUserId }),
    };
  }

  it("a non-owner admin cannot revoke another admin", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const [adminRow] = await testDb
      .insert(adminUsers)
      .values({ userId: admin.id, role: "admin" })
      .returning();
    if (!adminRow) throw new Error("admin row not created");

    mockAuth.userId = TEST_AUTH_ADMIN;
    const { request, params } = buildRequest(adminRow.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(403);
  });

  it("an owner can revoke a non-owner admin", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });
    const admin = await createUser(TEST_AUTH_ADMIN, "Admin");
    const [adminRow] = await testDb
      .insert(adminUsers)
      .values({ userId: admin.id, role: "admin" })
      .returning();
    if (!adminRow) throw new Error("admin row not created");

    mockAuth.userId = TEST_AUTH_OWNER;
    const { request, params } = buildRequest(adminRow.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);

    const reloaded = await testDb.query.adminUsers.findFirst({
      where: eq(adminUsers.id, adminRow.id),
    });
    expect(reloaded?.revokedAt).not.toBeNull();
  });

  it("the sole remaining owner cannot revoke themselves", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    const [ownerRow] = await testDb
      .insert(adminUsers)
      .values({ userId: owner.id, role: "owner" })
      .returning();
    if (!ownerRow) throw new Error("owner row not created");

    mockAuth.userId = TEST_AUTH_OWNER;
    const { request, params } = buildRequest(ownerRow.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(409);

    const reloaded = await testDb.query.adminUsers.findFirst({
      where: eq(adminUsers.id, ownerRow.id),
    });
    expect(reloaded?.revokedAt).toBeNull();
  });
});
