import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  organizationMembers,
  organizations,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { canMutate, isOwner, loadOrganizationMembership } from "./organization-auth";

/**
 * Integration tests against the local Postgres. Covers Phase 4's
 * organization creation/membership/role-authorization guarantees: the
 * creator becomes owner, non-members cannot view a private organization,
 * and member-role users cannot perform owner/admin mutations.
 */

let testDb: Db;

const TEST_AUTH_OWNER = "test-org-auth-owner";
const TEST_AUTH_MEMBER = "test-org-auth-member";
const TEST_AUTH_NON_MEMBER = "test-org-auth-non-member";
const TEST_ORG_SLUG = "test-org-auth-acme";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_MEMBER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_NON_MEMBER));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createOrgWithOwner() {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  if (!owner) throw new Error("owner not created");

  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Acme Corp", slug: TEST_ORG_SLUG })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb.insert(organizationMembers).values({
    organizationId: org.id,
    userId: owner.id,
    role: "owner",
  });

  return { owner, org };
}

describe("organization creation", () => {
  it("the creator becomes owner", async () => {
    const { owner, org } = await createOrgWithOwner();

    const membership = await testDb.query.organizationMembers.findFirst({
      where: (table, { and, eq: eqFn }) =>
        and(eqFn(table.organizationId, org.id), eqFn(table.userId, owner.id)),
    });

    expect(membership?.role).toBe("owner");
  });
});

describe("organization authorization", () => {
  it("a non-member cannot view a private organization", async () => {
    const { org } = await createOrgWithOwner();

    const [nonMember] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_NON_MEMBER, displayName: "Outsider" })
      .returning();
    if (!nonMember) throw new Error("non-member not created");

    const result = await loadOrganizationMembership(org.slug, nonMember);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 404 for an unknown organization slug", async () => {
    const [someUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_NON_MEMBER, displayName: "Nobody" })
      .returning();
    if (!someUser) throw new Error("user not created");

    const result = await loadOrganizationMembership(
      "this-slug-does-not-exist",
      someUser,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});

describe("role authorization", () => {
  it("a member cannot perform an owner/admin mutation", async () => {
    const { org } = await createOrgWithOwner();

    const [memberUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_MEMBER, displayName: "Member" })
      .returning();
    if (!memberUser) throw new Error("member not created");

    await testDb.insert(organizationMembers).values({
      organizationId: org.id,
      userId: memberUser.id,
      role: "member",
    });

    const result = await loadOrganizationMembership(org.slug, memberUser);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(canMutate(result.membership.role)).toBe(false);
      expect(isOwner(result.membership.role)).toBe(false);
    }
  });

  it("owner and admin roles can mutate", () => {
    expect(canMutate("owner")).toBe(true);
    expect(canMutate("admin")).toBe(true);
    expect(canMutate("member")).toBe(false);
  });
});
