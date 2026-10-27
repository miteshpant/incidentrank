import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, users, incidentPasses, type Db } from "@incidentrank/db";
import { grantIncidentPass } from "@/lib/server/incident-passes";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_ID = "test-incident-pass-bind-route";
const PAID_SCENARIO_SLUG = "rate-limit-misconfiguration";
const FREE_SCENARIO_SLUG = "database-connection-saturation";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Bind Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("POST /api/incident-passes/[passId]/bind", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  afterEach(async () => {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (user) {
      await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
    }
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
  });

  async function ensureUser() {
    const existing = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (existing) return existing;
    const [created] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Bind Route Tester" })
      .returning();
    if (!created) throw new Error("user not created");
    return created;
  }

  function buildRequest(passId: string, scenarioSlug: string) {
    return new Request(`http://internal/api/incident-passes/${passId}/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    });
  }

  it("binds an available pass to a premium scenario", async () => {
    const user = await ensureUser();
    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");

    const response = await POST(buildRequest(pass.id, PAID_SCENARIO_SLUG), {
      params: Promise.resolve({ passId: pass.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pass.status).toBe("bound");
  });

  it("refuses to bind to a free scenario", async () => {
    const user = await ensureUser();
    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");

    const response = await POST(buildRequest(pass.id, FREE_SCENARIO_SLUG), {
      params: Promise.resolve({ passId: pass.id }),
    });

    expect(response.status).toBe(400);
  });

  it("refuses to bind a pass that belongs to a different user", async () => {
    const [otherUser] = await testDb
      .insert(users)
      .values({ authProviderId: "test-incident-pass-bind-other", displayName: "Other" })
      .returning();
    if (!otherUser) throw new Error("other user not created");
    const pass = await grantIncidentPass(testDb, {
      userId: otherUser.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");

    try {
      const response = await POST(buildRequest(pass.id, PAID_SCENARIO_SLUG), {
        params: Promise.resolve({ passId: pass.id }),
      });
      expect(response.status).toBe(403);
    } finally {
      await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, otherUser.id));
      await testDb.delete(users).where(eq(users.id, otherUser.id));
    }
  });

  it("cannot bind the same pass twice (second attempt conflicts)", async () => {
    const user = await ensureUser();
    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");

    const first = await POST(buildRequest(pass.id, PAID_SCENARIO_SLUG), {
      params: Promise.resolve({ passId: pass.id }),
    });
    expect(first.status).toBe(200);

    const second = await POST(buildRequest(pass.id, PAID_SCENARIO_SLUG), {
      params: Promise.resolve({ passId: pass.id }),
    });
    expect(second.status).toBe(409);
  });
});
