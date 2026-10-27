import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  adminAuditEvents,
  adminUsers,
  organizationCreditLedger,
  organizationMembers,
  organizations,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { recordOrganizationCreditPurchase } from "@/lib/server/organization-credits";
import type { POST as PostHandler } from "./route";

/**
 * Platform-admin credit adjustment route tests (docs/implementation_
 * plan/phase10b.md §39/§40, §69). Covers the require-reason guard, the
 * never-negative-balance guard, and the platform admin_audit_events
 * write — mirrors organization-provisioning.test.ts's fixture style.
 */

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({ fullName: "Adjustment Tester", username: null, primaryEmailAddress: null }),
}));

let testDb: Db;
let POST: typeof PostHandler;

const TEST_AUTH_ADMIN = "test-credit-adjust-admin";
const TEST_AUTH_NON_ADMIN = "test-credit-adjust-non-admin";
const TEST_ORG_SLUG_PREFIX = "test-credit-adjust-";

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
  const orgs = await testDb.query.organizations.findMany({
    where: like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`),
  });
  for (const org of orgs) {
    await testDb.delete(organizationCreditLedger).where(eq(organizationCreditLedger.organizationId, org.id));
    await testDb.delete(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
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
    .values({ authProviderId: `${TEST_AUTH_NON_ADMIN}-${counter}`, displayName: "Org Owner" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createOrg() {
  counter += 1;
  const slug = `${TEST_ORG_SLUG_PREFIX}${counter}`;
  const [org] = await testDb.insert(organizations).values({ name: "Adjust Tester Org", slug }).returning();
  if (!org) throw new Error("org not created");
  return org;
}

function postBody(organizationId: string, quantity: number, reason: string) {
  return new Request(`http://localhost/api/admin/organizations/${organizationId}/credits/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity, reason }),
  });
}

async function postAsParams(organizationId: string, quantity: number, reason: string) {
  return POST(postBody(organizationId, quantity, reason), {
    params: Promise.resolve({ organizationId }),
  });
}

describe("POST /api/admin/organizations/[organizationId]/credits/adjust", () => {
  it("401s when signed out", async () => {
    const org = await createOrg();
    const response = await postAsParams(org.id, 1, "test");
    expect(response.status).toBe(401);
  });

  it("403s for a signed-in user who is not a platform admin", async () => {
    const org = await createOrg();
    const user = await createNonAdminUser();
    mockAuth.userId = user.authProviderId;

    const response = await postAsParams(org.id, 1, "test");
    expect(response.status).toBe(403);
  });

  it("an org owner (not a platform admin) cannot perform the adjustment", async () => {
    const org = await createOrg();
    const owner = await createNonAdminUser();
    await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: owner.id, role: "owner" });
    mockAuth.userId = owner.authProviderId;

    const response = await postAsParams(org.id, 1, "test");
    expect(response.status).toBe(403);
  });

  it("requires a non-zero quantity", async () => {
    const org = await createOrg();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await postAsParams(org.id, 0, "test");
    expect(response.status).toBe(400);
  });

  it("requires a reason", async () => {
    const org = await createOrg();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await postAsParams(org.id, 1, "");
    expect(response.status).toBe(400);
  });

  it("a platform admin can grant a positive adjustment, and it is audited", async () => {
    const org = await createOrg();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;

    const response = await postAsParams(org.id, 5, "goodwill credit");
    expect(response.status).toBe(200);

    const ledgerRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0]?.quantity).toBe(5);
    expect(ledgerRows[0]?.reason).toBe("goodwill credit");

    const auditRows = await testDb.query.adminAuditEvents.findMany({
      where: eq(adminAuditEvents.adminUserId, user.id),
    });
    expect(auditRows.some((r) => r.action === "credit_adjustment")).toBe(true);
  });

  it("a negative adjustment that would drive the balance below zero is rejected", async () => {
    const org = await createOrg();
    const { user } = await createPlatformAdmin();
    mockAuth.userId = user.authProviderId;
    await testDb.transaction((tx) =>
      recordOrganizationCreditPurchase(tx, {
        organizationId: org.id,
        quantity: 1,
        stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
        stripePaymentIntentId: null,
        purchasingUserId: null,
      }),
    );

    const response = await postAsParams(org.id, -5, "would overdraw");
    expect(response.status).toBe(400);

    const ledgerRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    expect(ledgerRows.length).toBe(1); // only the original purchase — no adjustment row added
  });
});
