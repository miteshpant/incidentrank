import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { createDb, privacyRequests, users, type Db } from "@incidentrank/db";
import type { GET as GetHandler, POST as PostHandler } from "./route";

const TEST_AUTH_USER = "test-privacy-requests-route-user";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Privacy Requests Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

function buildPost(body: unknown) {
  return new Request("http://internal/api/privacy-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST/GET /api/privacy-requests", () => {
  let testDb: Db;
  let POST: typeof PostHandler;
  let GET: typeof GetHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST, GET } = await import("./route"));
  }, 30_000);

  afterEach(async () => {
    mockAuth.userId = null;
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
    if (user) {
      await testDb.delete(privacyRequests).where(eq(privacyRequests.userId, user.id));
      await testDb.delete(users).where(eq(users.id, user.id));
    }
    await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
  });

  it("1. rejects an unauthenticated POST", async () => {
    const response = await POST(buildPost({ requestType: "access" }));
    expect(response.status).toBe(401);
  });

  it("2. rejects an invalid requestType", async () => {
    mockAuth.userId = TEST_AUTH_USER;
    const response = await POST(buildPost({ requestType: "deletion" })); // deletion has its own route
    expect(response.status).toBe(400);
  });

  it("3. creates a pending request for the authenticated user, deriving userId server-side", async () => {
    mockAuth.userId = TEST_AUTH_USER;
    const response = await POST(buildPost({ requestType: "access", notes: "please send my data" }));
    expect(response.status).toBe(200);

    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
    const rows = await testDb.query.privacyRequests.findMany({ where: eq(privacyRequests.userId, user!.id) });
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("4. GET returns only the authenticated user's own requests", async () => {
    mockAuth.userId = TEST_AUTH_USER;
    await POST(buildPost({ requestType: "correction" }));
    const response = await GET();
    const body = (await response.json()) as { requests: Array<{ requestType: string }> };
    expect(body.requests.length).toBe(1);
    expect(body.requests[0]?.requestType).toBe("correction");
  });
});
