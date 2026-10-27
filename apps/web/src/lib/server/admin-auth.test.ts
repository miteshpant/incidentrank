import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminUsers, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  isIncidentRankDomainEmail,
  isOwnerRole,
  loadAdminMembership,
  requirePlatformOwner,
} from "./admin-auth";
import { wouldDemoteLastOwner, wouldLeaveNoOwner } from "./admin-ownership";

let testDb: Db;

const TEST_AUTH_OWNER = "test-admin-auth-owner";
const TEST_AUTH_REVOKED = "test-admin-auth-revoked";
const TEST_AUTH_NON_ADMIN = "test-admin-auth-non-admin";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  for (const authId of [TEST_AUTH_OWNER, TEST_AUTH_REVOKED, TEST_AUTH_NON_ADMIN]) {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, authId),
    });
    if (user) {
      await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
    }
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_REVOKED));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_NON_ADMIN));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(authProviderId: string, displayName: string) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId, displayName })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

describe("isIncidentRankDomainEmail", () => {
  it("accepts a verified @incidentrank.com email, case-insensitively", () => {
    expect(isIncidentRankDomainEmail("mpant@incidentrank.com")).toBe(true);
    expect(isIncidentRankDomainEmail("Someone@IncidentRank.com")).toBe(true);
  });

  it("rejects any other domain", () => {
    expect(isIncidentRankDomainEmail("mpant@gmail.com")).toBe(false);
    expect(isIncidentRankDomainEmail("mpant@incidentrank.com.evil.com")).toBe(
      false,
    );
  });
});

describe("loadAdminMembership", () => {
  it("returns 403 for a user with no admin row", async () => {
    const user = await createUser(TEST_AUTH_NON_ADMIN, "Non Admin");
    const result = await loadAdminMembership(user);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns the active membership for an owner", async () => {
    const user = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: user.id, role: "owner" });

    const result = await loadAdminMembership(user);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.role).toBe("owner");
      expect(isOwnerRole(result.membership.role)).toBe(true);
    }
  });

  it("never authorizes against a revoked membership row — domain alone is insufficient", async () => {
    const user = await createUser(TEST_AUTH_REVOKED, "Revoked Admin");
    await testDb.insert(adminUsers).values({
      userId: user.id,
      role: "admin",
      revokedAt: new Date(),
    });

    const result = await loadAdminMembership(user);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

describe("owner protections", () => {
  it("the sole active owner cannot be revoked", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });

    const wouldLeaveZero = await wouldLeaveNoOwner("owner", owner.id);
    expect(wouldLeaveZero).toBe(true);
  });

  it("the sole active owner cannot be demoted to admin", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });

    const wouldDemote = await wouldDemoteLastOwner("owner", "admin", owner.id);
    expect(wouldDemote).toBe(true);
  });

  it("revoking a non-owner admin never triggers the last-owner guard", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });
    const admin = await createUser(TEST_AUTH_NON_ADMIN, "Admin");
    await testDb.insert(adminUsers).values({ userId: admin.id, role: "admin" });

    const wouldLeaveZero = await wouldLeaveNoOwner("admin", admin.id);
    expect(wouldLeaveZero).toBe(false);
  });
});

describe("requirePlatformOwner", () => {
  it("allows the platform owner through", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Owner");
    await testDb.insert(adminUsers).values({ userId: owner.id, role: "owner" });

    const membership = await loadAdminMembership(owner);
    const result = requirePlatformOwner(membership);
    expect(result.ok).toBe(true);
  });

  it("rejects a plain active admin — closes the self-escalation gap (phase10a.md §1/§48)", async () => {
    const admin = await createUser(TEST_AUTH_NON_ADMIN, "Plain Admin");
    await testDb.insert(adminUsers).values({ userId: admin.id, role: "admin" });

    const membership = await loadAdminMembership(admin);
    const result = requirePlatformOwner(membership);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a non-admin user", async () => {
    const user = await createUser(TEST_AUTH_NON_ADMIN, "Non Admin");
    const membership = await loadAdminMembership(user);
    const result = requirePlatformOwner(membership);
    expect(result.ok).toBe(false);
  });

  it("rejects a revoked owner row", async () => {
    const owner = await createUser(TEST_AUTH_OWNER, "Former Owner");
    await testDb.insert(adminUsers).values({
      userId: owner.id,
      role: "owner",
      revokedAt: new Date(),
    });

    const membership = await loadAdminMembership(owner);
    const result = requirePlatformOwner(membership);
    expect(result.ok).toBe(false);
  });
});
