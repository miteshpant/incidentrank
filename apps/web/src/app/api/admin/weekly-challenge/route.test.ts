import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  adminAuditEvents,
  adminUsers,
  scenarios,
  users,
  weeklyChallenges,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { GET as GetHandler, PATCH as PatchHandler } from "./route";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Weekly Challenge Admin Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

const TEST_AUTH_ADMIN = "test-weekly-challenge-route-admin";
const TEST_AUTH_NON_ADMIN = "test-weekly-challenge-route-non-admin";

/**
 * docs/implementation_plan/phase-challege-version.md §2/§13/§18. Mirrors
 * admin/scenarios/[scenarioId]/route.test.ts's exact fixture style —
 * real seeded built-in scenarios (payment-retry-storm,
 * kafka-consumer-lag), real admin_users rows, real audit log assertions.
 */
describe("GET/PATCH /api/admin/weekly-challenge", () => {
  let testDb: Db;
  let GET: typeof GetHandler;
  let PATCH: typeof PatchHandler;
  let scenarioAId: string;
  let scenarioBId: string;

  beforeAll(async () => {
    testDb = createDb();
    ({ GET, PATCH } = await import("./route"));
    const a = await testDb.query.scenarios.findFirst({ where: eq(scenarios.slug, "payment-retry-storm") });
    const b = await testDb.query.scenarios.findFirst({ where: eq(scenarios.slug, "kafka-consumer-lag") });
    if (!a || !b) throw new Error("seed scenarios missing — run pnpm db:seed");
    scenarioAId = a.id;
    scenarioBId = b.id;
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockAuth.userId = null;
    await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.scenarioId, scenarioAId));
    await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.scenarioId, scenarioBId));
    const adminTestUsers = await testDb.query.users.findMany({
      where: like(users.authProviderId, `${TEST_AUTH_ADMIN}%`),
    });
    for (const user of adminTestUsers) {
      await testDb.delete(adminAuditEvents).where(eq(adminAuditEvents.adminUserId, user.id));
      await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
    }
    await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_ADMIN}%`));
    await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_NON_ADMIN}%`));
  });

  afterAll(async () => {
    await testDb.$client.end({ timeout: 1 });
  });

  let counter = 0;
  async function createPlatformAdmin() {
    counter += 1;
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: `${TEST_AUTH_ADMIN}-${counter}`, displayName: "Platform Admin" })
      .returning();
    if (!user) throw new Error("user not created");
    await testDb.insert(adminUsers).values({ userId: user.id, role: "admin" });
    return user;
  }

  it("rejects a non-admin", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_NON_ADMIN, displayName: "Not Admin" })
      .returning();
    if (!user) throw new Error("user not created");
    mockAuth.userId = TEST_AUTH_NON_ADMIN;

    const response = await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: scenarioAId }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("an admin can activate a Weekly Challenge, and it appears in GET", async () => {
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    const patchResponse = await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: scenarioAId }),
      }),
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await GET();
    const getBody = await getResponse.json();
    expect(getBody.active.scenarioId).toBe(scenarioAId);

    const auditRows = await testDb.query.adminAuditEvents.findMany({
      where: eq(adminAuditEvents.adminUserId, admin.id),
    });
    expect(auditRows.some((row) => row.action === "weekly_challenge_activated")).toBe(true);
  });

  it("activating a different scenario replaces the current one", async () => {
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: scenarioAId }),
      }),
    );
    await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: scenarioBId }),
      }),
    );

    const getResponse = await GET();
    const getBody = await getResponse.json();
    expect(getBody.active.scenarioId).toBe(scenarioBId);

    const activeRows = await testDb.query.weeklyChallenges.findMany({
      where: eq(weeklyChallenges.active, true),
    });
    expect(activeRows).toHaveLength(1);
  });

  it("an admin can deactivate the current challenge", async () => {
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: scenarioAId }),
      }),
    );
    const deactivateResponse = await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deactivate" }),
      }),
    );
    expect(deactivateResponse.status).toBe(200);

    const getResponse = await GET();
    const getBody = await getResponse.json();
    expect(getBody.active).toBeNull();

    const auditRows = await testDb.query.adminAuditEvents.findMany({
      where: eq(adminAuditEvents.adminUserId, admin.id),
    });
    expect(auditRows.some((row) => row.action === "weekly_challenge_deactivated")).toBe(true);
  });

  it("rejects an org-owned or unknown scenarioId", async () => {
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    const response = await PATCH(
      new Request("http://internal/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "00000000-0000-0000-0000-000000000000" }),
      }),
    );
    expect(response.status).toBe(404);
  });
});
