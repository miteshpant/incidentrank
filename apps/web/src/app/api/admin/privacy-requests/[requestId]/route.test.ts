import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { adminUsers, createDb, privacyRequests, users, type Db } from "@incidentrank/db";
import type { PATCH as PatchHandler } from "./route";

const TEST_AUTH_OWNER = "test-privacy-request-status-owner";
const TEST_AUTH_NON_ADMIN = "test-privacy-request-status-non-admin";
const TEST_AUTH_TARGET = "test-privacy-request-status-target";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Privacy Request Status Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

function buildRequest(status: string) {
  return new Request("http://internal/api/admin/privacy-requests/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

describe("PATCH /api/admin/privacy-requests/[requestId]", () => {
  let testDb: Db;
  let PATCH: typeof PatchHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ PATCH } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockAuth.userId = null;
    for (const authId of [TEST_AUTH_OWNER, TEST_AUTH_NON_ADMIN, TEST_AUTH_TARGET]) {
      const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
      if (user) {
        await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
        await testDb.delete(privacyRequests).where(eq(privacyRequests.userId, user.id));
        await testDb.delete(users).where(eq(users.id, user.id));
      }
    }
  });

  async function createPendingRequest() {
    const [target] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_TARGET, displayName: "Target" })
      .returning();
    if (!target) throw new Error("target not created");
    const [request] = await testDb
      .insert(privacyRequests)
      .values({ userId: target.id, requestType: "access", status: "pending" })
      .returning();
    if (!request) throw new Error("request not created");
    return request;
  }

  it("1. a non-admin cannot update a privacy request's status", async () => {
    const request = await createPendingRequest();
    mockAuth.userId = TEST_AUTH_NON_ADMIN;
    await testDb.insert(users).values({ authProviderId: TEST_AUTH_NON_ADMIN, displayName: "Non Admin" });

    const response = await PATCH(buildRequest("completed"), { params: Promise.resolve({ requestId: request.id }) });
    expect(response.status).toBe(403);
  });

  it("2. an active admin can mark a request completed", async () => {
    const request = await createPendingRequest();
    mockAuth.userId = TEST_AUTH_OWNER;
    const [owner] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
      .returning();
    if (!owner) throw new Error("owner not created");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });

    const response = await PATCH(buildRequest("completed"), { params: Promise.resolve({ requestId: request.id }) });
    expect(response.status).toBe(200);

    const reloaded = await testDb.query.privacyRequests.findFirst({ where: eq(privacyRequests.id, request.id) });
    expect(reloaded?.status).toBe("completed");
    expect(reloaded?.completedAt).toBeInstanceOf(Date);
  });
});
