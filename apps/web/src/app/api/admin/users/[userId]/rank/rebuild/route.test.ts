import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  adminAuditEvents,
  adminUsers,
  attempts,
  rankSnapshots,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

/**
 * Platform-admin Engineer Rank rebuild route tests (docs/implementation_
 * plan/phase10c.md §21/§64 — admin-required, revoked-admin-denied,
 * non-admin-403, successful rebuild inserts a row, cross-user mutation
 * blocked). Mirrors the credits/adjust route test's fixture style.
 */

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({ fullName: "Rank Rebuild Tester", username: null, primaryEmailAddress: null }),
}));

let testDb: Db;
let POST: typeof PostHandler;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_ADMIN = "test-rank-rebuild-admin";
const TEST_AUTH_NON_ADMIN = "test-rank-rebuild-non-admin";
const TEST_AUTH_TARGET = "test-rank-rebuild-target";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = 1;
  ({ POST } = await import("./route"));
}, 30_000);

beforeEach(() => {
  vi.stubEnv("ADMIN_PORTAL_ENABLED", "true");
  vi.stubEnv("ENGINEER_RANK_ENABLED", "true");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockAuth.userId = null;

  const targetUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_TARGET}%`),
  });
  for (const user of targetUsers) {
    await testDb.delete(rankSnapshots).where(eq(rankSnapshots.userId, user.id));
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_TARGET}%`));

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

async function createNonAdminUser() {
  counter += 1;
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_NON_ADMIN}-${counter}`, displayName: "Not Admin" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createTargetUserWithEvidence() {
  counter += 1;
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_TARGET}-${counter}`, displayName: "Rank Target" })
    .returning();
  if (!user) throw new Error("user not created");
  await testDb.insert(attempts).values({
    userId: user.id,
    scenarioId,
    scenarioVersion,
    attemptType: "practice",
    status: "completed",
    outcome: "resolved",
    score: 900,
    recoveryScore: 900,
    customerImpactScore: 900,
    dataIntegrityScore: 900,
    reliabilityScore: 900,
    costEfficiencyScore: 900,
    operationalEfficiencyScore: 900,
    completedAt: new Date(),
  });
  return user;
}

function postRequest(userId: string) {
  return new Request(`http://localhost/api/admin/users/${userId}/rank/rebuild`, { method: "POST" });
}

async function postAsParams(userId: string) {
  return POST(postRequest(userId), { params: Promise.resolve({ userId }) });
}

describe("POST /api/admin/users/[userId]/rank/rebuild", () => {
  it("401s when signed out", async () => {
    const target = await createTargetUserWithEvidence();
    const response = await postAsParams(target.id);
    expect(response.status).toBe(401);
  });

  it("403s for a signed-in user who is not a platform admin", async () => {
    const target = await createTargetUserWithEvidence();
    const nonAdmin = await createNonAdminUser();
    mockAuth.userId = nonAdmin.authProviderId;

    const response = await postAsParams(target.id);
    expect(response.status).toBe(403);
  });

  it("404s when the admin portal flag is off", async () => {
    vi.stubEnv("ADMIN_PORTAL_ENABLED", "false");
    const target = await createTargetUserWithEvidence();
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    const response = await postAsParams(target.id);
    expect(response.status).toBe(404);
  });

  it("404s when the Engineer Rank flag is off", async () => {
    vi.stubEnv("ENGINEER_RANK_ENABLED", "false");
    const target = await createTargetUserWithEvidence();
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    const response = await postAsParams(target.id);
    expect(response.status).toBe(404);
  });

  it("a platform admin can rebuild another user's rank, inserting a snapshot and an audit row", async () => {
    const target = await createTargetUserWithEvidence();
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    const response = await postAsParams(target.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rankBand).not.toBeNull();

    const snapshots = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, target.id),
    });
    expect(snapshots.length).toBe(1);

    const auditRows = await testDb.query.adminAuditEvents.findMany({
      where: eq(adminAuditEvents.adminUserId, admin.id),
    });
    expect(auditRows.some((r) => r.action === "engineer_rank_rebuild" && r.targetId === target.id)).toBe(true);
  });

  it("rebuilding one user's rank never creates a snapshot for a different user", async () => {
    const target = await createTargetUserWithEvidence();
    const otherTarget = await createTargetUserWithEvidence();
    const admin = await createPlatformAdmin();
    mockAuth.userId = admin.authProviderId;

    await postAsParams(target.id);

    const otherSnapshots = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, otherTarget.id),
    });
    expect(otherSnapshots.length).toBe(0);
  });
});
