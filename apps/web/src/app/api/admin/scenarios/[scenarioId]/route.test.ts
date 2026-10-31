import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  adminAuditEvents,
  adminUsers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { PATCH as PatchHandler } from "./route";

/**
 * Platform-admin scenario metadata editor route tests (Phase 10G §2/§3).
 * Mirrors credits/adjust/route.test.ts's fixture style. Uses an
 * org-owned scenario row as the test subject (org-owned slugs are only
 * unique per-organization, so a throwaway test slug never collides with
 * the real built-in catalog).
 */

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({ fullName: "Scenario Editor Tester", username: null, primaryEmailAddress: null }),
}));

let testDb: Db;
let PATCH: typeof PatchHandler;

const TEST_AUTH_ADMIN = "test-scenario-edit-admin";
const TEST_AUTH_NON_ADMIN = "test-scenario-edit-non-admin";
const TEST_ORG_SLUG_PREFIX = "test-scenario-edit-org-";

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
  const orgs = await testDb.query.organizations.findMany({
    where: like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`),
  });
  for (const org of orgs) {
    await testDb.delete(scenarios).where(eq(scenarios.organizationId, org.id));
    await testDb.delete(organizations).where(eq(organizations.id, org.id));
  }
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
  const [admin] = await testDb
    .insert(adminUsers)
    .values({ userId: user.id, role: "admin" })
    .returning();
  if (!admin) throw new Error("admin not created");
  return { user, admin };
}

async function createNonAdminUser() {
  counter += 1;
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_NON_ADMIN}-${counter}`, displayName: "Regular User" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createTestScenario() {
  counter += 1;
  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Scenario Edit Tester Org", slug: `${TEST_ORG_SLUG_PREFIX}${counter}` })
    .returning();
  if (!org) throw new Error("org not created");
  const [scenario] = await testDb
    .insert(scenarios)
    .values({
      slug: `test-scenario-${counter}`,
      name: "Test Scenario",
      ownershipType: "organization",
      organizationId: org.id,
      isFree: false,
      structure: "linear",
    })
    .returning();
  if (!scenario) throw new Error("scenario not created");
  return scenario;
}

function patchBody(scenarioId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/admin/scenarios/${scenarioId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchAsParams(scenarioId: string, body: Record<string, unknown>) {
  return PATCH(patchBody(scenarioId, body), { params: Promise.resolve({ scenarioId }) });
}

describe("PATCH /api/admin/scenarios/[scenarioId]", () => {
  it("401s when signed out", async () => {
    const scenario = await createTestScenario();
    const response = await patchAsParams(scenario.id, { isFree: true });
    expect(response.status).toBe(401);
  });

  it("403s for a signed-in user who is not a platform admin", async () => {
    const scenario = await createTestScenario();
    const user = await createNonAdminUser();
    mockAuth.userId = user.authProviderId;

    const response = await patchAsParams(scenario.id, { isFree: true });
    expect(response.status).toBe(403);
  });

  it("404s for an unknown scenario id", async () => {
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await patchAsParams("00000000-0000-0000-0000-000000000000", { isFree: true });
    expect(response.status).toBe(404);
  });

  it("rejects an invalid status value", async () => {
    const scenario = await createTestScenario();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await patchAsParams(scenario.id, { status: "not-a-real-status" });
    expect(response.status).toBe(400);
  });

  it("setting isFree stamps isFreeOverriddenByAdmin=true and is audited", async () => {
    const scenario = await createTestScenario();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await patchAsParams(scenario.id, { isFree: true });
    expect(response.status).toBe(200);

    const updated = await testDb.query.scenarios.findFirst({ where: eq(scenarios.id, scenario.id) });
    expect(updated?.isFree).toBe(true);
    expect(updated?.isFreeOverriddenByAdmin).toBe(true);

    const auditRows = await testDb.query.adminAuditEvents.findMany({
      where: eq(adminAuditEvents.adminUserId, user.id),
    });
    expect(auditRows.some((r) => r.action === "scenario_metadata_update")).toBe(true);
  });

  it("can update structure, domain, releaseWeek, and publishedAt together", async () => {
    const scenario = await createTestScenario();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await patchAsParams(scenario.id, {
      structure: "cascading",
      domain: "Caching",
      releaseWeek: "2026-W05",
      publishedAt: "2026-02-02T00:00:00.000Z",
    });
    expect(response.status).toBe(200);

    const updated = await testDb.query.scenarios.findFirst({ where: eq(scenarios.id, scenario.id) });
    expect(updated?.structure).toBe("cascading");
    expect(updated?.domain).toBe("Caching");
    expect(updated?.releaseWeek).toBe("2026-W05");
    expect(updated?.publishedAt?.toISOString()).toBe("2026-02-02T00:00:00.000Z");
    // Untouched by this request.
    expect(updated?.isFreeOverriddenByAdmin).toBe(false);
  });

  it("the narrow reset action clears isFreeOverriddenByAdmin without touching isFree", async () => {
    const scenario = await createTestScenario();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    await patchAsParams(scenario.id, { isFree: true });
    const afterOverride = await testDb.query.scenarios.findFirst({ where: eq(scenarios.id, scenario.id) });
    expect(afterOverride?.isFree).toBe(true);
    expect(afterOverride?.isFreeOverriddenByAdmin).toBe(true);

    const resetResponse = await patchAsParams(scenario.id, { isFreeOverriddenByAdmin: false });
    expect(resetResponse.status).toBe(200);

    const afterReset = await testDb.query.scenarios.findFirst({ where: eq(scenarios.id, scenario.id) });
    expect(afterReset?.isFree).toBe(true);
    expect(afterReset?.isFreeOverriddenByAdmin).toBe(false);
  });

  it("400s when no fields are provided", async () => {
    const scenario = await createTestScenario();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await patchAsParams(scenario.id, {});
    expect(response.status).toBe(400);
  });
});
