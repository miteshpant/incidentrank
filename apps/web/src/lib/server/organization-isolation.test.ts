import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { loadOrganizationMembership, requireActiveOrganization } from "./organization-auth";
import { loadOrgScenario } from "./scenario-access";

/**
 * Integration tests against local Postgres for Phase 10A's suspension
 * isolation guarantee (docs/implementation_plan/phase10a.md §65):
 * suspending one organization must never affect a sibling organization's
 * ability to read or mutate its own data. Cross-org membership/invitation/
 * scenario privacy itself is already thoroughly covered by
 * org-membership.test.ts's "cross-org privacy" suite and scenario-
 * authoring.test.ts's "cross-org privacy" suite — this file only adds the
 * genuinely new Phase 10A case: suspension's blast radius is exactly one
 * organization, never leaking to another.
 */

let testDb: Db;

const TEST_AUTH_OWNER_A = "test-org-isolation-owner-a";
const TEST_AUTH_OWNER_B = "test-org-isolation-owner-b";
const TEST_ORG_SLUG_A = "test-org-isolation-acme";
const TEST_ORG_SLUG_B = "test-org-isolation-globex";

beforeAll(() => {
  testDb = createDb();
});

afterEach(async () => {
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG_A));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG_B));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER_A));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER_B));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createOrgWithOwner(authId: string, slug: string, name: string, status: "active" | "suspended" = "active") {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: authId, displayName: name })
    .returning();
  if (!owner) throw new Error("owner not created");

  const [org] = await testDb.insert(organizations).values({ name, slug, status }).returning();
  if (!org) throw new Error("org not created");

  await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: owner.id, role: "owner" });

  return { owner, org };
}

describe("suspension isolation (phase10a.md §17/§65)", () => {
  it("suspending org A blocks org A's scenario mutation guard but leaves org B fully active", async () => {
    const { owner: ownerA, org: orgA } = await createOrgWithOwner(
      TEST_AUTH_OWNER_A,
      TEST_ORG_SLUG_A,
      "Acme Corp",
      "suspended",
    );
    const { owner: ownerB, org: orgB } = await createOrgWithOwner(
      TEST_AUTH_OWNER_B,
      TEST_ORG_SLUG_B,
      "Globex",
      "active",
    );

    const membershipA = await loadOrganizationMembership(orgA.slug, ownerA);
    expect(membershipA.ok).toBe(true);
    if (membershipA.ok) {
      const guardA = requireActiveOrganization(membershipA.organization);
      expect(guardA.ok).toBe(false);
      if (!guardA.ok) expect(guardA.reason).toBe("organization_suspended");
    }

    const membershipB = await loadOrganizationMembership(orgB.slug, ownerB);
    expect(membershipB.ok).toBe(true);
    if (membershipB.ok) {
      const guardB = requireActiveOrganization(membershipB.organization);
      expect(guardB.ok).toBe(true);
    }
  });

  it("org A's owner cannot use org A's suspension to read or mutate org B's scenario", async () => {
    const { owner: ownerA, org: orgA } = await createOrgWithOwner(
      TEST_AUTH_OWNER_A,
      TEST_ORG_SLUG_A,
      "Acme Corp",
      "suspended",
    );
    const { owner: ownerB, org: orgB } = await createOrgWithOwner(
      TEST_AUTH_OWNER_B,
      TEST_ORG_SLUG_B,
      "Globex",
      "active",
    );
    void orgA;

    const [scenarioB] = await testDb
      .insert(scenarios)
      .values({
        organizationId: orgB.id,
        ownershipType: "organization",
        name: "Globex-only scenario",
        slug: "test-org-isolation-globex-scenario",
        createdByUserId: ownerB.id,
      })
      .returning();
    if (!scenarioB) throw new Error("scenario not created");

    try {
      // Org A's (suspended) owner attempting to reach org B's scenario via
      // org B's own slug — must 404, exactly as it would for any outsider,
      // regardless of org A's suspension status.
      const result = await loadOrgScenario(orgB.slug, scenarioB.id, ownerA);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);

      // The legitimate owner of org B is wholly unaffected by org A's
      // suspension.
      const legitimate = await loadOrgScenario(orgB.slug, scenarioB.id, ownerB);
      expect(legitimate.ok).toBe(true);
      if (legitimate.ok) {
        const guard = requireActiveOrganization(legitimate.organization);
        expect(guard.ok).toBe(true);
      }
    } finally {
      await testDb.delete(scenarios).where(eq(scenarios.id, scenarioB.id));
    }
  });

  it("a pending organization's mutation guard is rejected with organization_pending, distinct from suspension", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_AUTH_OWNER_A, TEST_ORG_SLUG_A, "Acme Corp", "active");
    await testDb.update(organizations).set({ status: "pending" }).where(eq(organizations.id, org.id));

    const membership = await loadOrganizationMembership(org.slug, owner);
    expect(membership.ok).toBe(true);
    if (membership.ok) {
      const guard = requireActiveOrganization(membership.organization);
      expect(guard.ok).toBe(false);
      if (!guard.ok) expect(guard.reason).toBe("organization_pending");
    }
  });
});
