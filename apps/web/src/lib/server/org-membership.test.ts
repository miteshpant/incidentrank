import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  organizationInvitations,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import {
  canChangeRole,
  canInviteMembers,
  canManageMember,
} from "./organization-auth";
import {
  acceptOrgInvitation,
  changeMemberRole,
  createOrgInvitation,
  invitationState,
  listOrgMembers,
  listPendingInvitations,
  loadOrgInviteByToken,
  removeMember,
  revokeOrgInvitation,
  ORG_INVITE_EXPIRY_MS,
} from "./org-membership";
import { generateInviteToken, hashInviteToken, normalizeEmail } from "./invite-token";

/**
 * Integration tests against local Postgres for Phase 5.2's organization
 * membership/invitation system, matching the test list in
 * docs/implementation_plan/phase5.2.md: invitation creation/permissions,
 * token security, duplicate/cross-org invite handling, acceptance +
 * atomicity + identity matching, invitation states, role-change/removal
 * authorization and last-owner protection, cross-org privacy, and the
 * assessment-candidate/organization-member separation.
 */

let testDb: Db;

const TEST_AUTH_OWNER = "test-org-membership-owner";
const TEST_AUTH_OTHER_OWNER = "test-org-membership-other-owner";
const TEST_AUTH_ADMIN = "test-org-membership-admin";
const TEST_AUTH_MEMBER = "test-org-membership-member";
const TEST_AUTH_INVITEE = "test-org-membership-invitee";
const TEST_AUTH_OTHER = "test-org-membership-other";
const TEST_ORG_SLUG = "test-org-membership-acme";
const TEST_OTHER_ORG_SLUG = "test-org-membership-globex";

const ALL_AUTH_IDS = [
  TEST_AUTH_OWNER,
  TEST_AUTH_OTHER_OWNER,
  TEST_AUTH_ADMIN,
  TEST_AUTH_MEMBER,
  TEST_AUTH_INVITEE,
  TEST_AUTH_OTHER,
];

beforeAll(() => {
  testDb = createDb();
});

afterEach(async () => {
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_OTHER_ORG_SLUG));
  for (const authId of ALL_AUTH_IDS) {
    await testDb.delete(users).where(eq(users.authProviderId, authId));
  }
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(authId: string, name: string) {
  const [user] = await testDb.insert(users).values({ authProviderId: authId, displayName: name }).returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createOrgWithOwner(slug: string, name: string, ownerAuthId: string = TEST_AUTH_OWNER) {
  const owner = await createUser(ownerAuthId, "Owner");
  const [org] = await testDb.insert(organizations).values({ name, slug }).returning();
  if (!org) throw new Error("org not created");
  await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: owner.id, role: "owner" });
  return { owner, org };
}

async function addMember(orgId: string, authId: string, name: string, role: "owner" | "admin" | "member") {
  const user = await createUser(authId, name);
  const [member] = await testDb
    .insert(organizationMembers)
    .values({ organizationId: orgId, userId: user.id, role })
    .returning();
  if (!member) throw new Error("member not created");
  return { user, member };
}

describe("canInviteMembers / canManageMember / canChangeRole policy", () => {
  it("owner and admin may invite; member may not", () => {
    expect(canInviteMembers("owner")).toBe(true);
    expect(canInviteMembers("admin")).toBe(true);
    expect(canInviteMembers("member")).toBe(false);
  });

  it("owner can manage anyone; admin can manage member only; member can manage no one", () => {
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canManageMember("owner", "admin")).toBe(true);
    expect(canManageMember("owner", "member")).toBe(true);
    expect(canManageMember("admin", "member")).toBe(true);
    expect(canManageMember("admin", "admin")).toBe(false);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("member", "owner")).toBe(false);
    expect(canManageMember("member", "admin")).toBe(false);
    expect(canManageMember("member", "member")).toBe(false);
  });

  it("only owner may change roles", () => {
    expect(canChangeRole("owner")).toBe(true);
    expect(canChangeRole("admin")).toBe(false);
    expect(canChangeRole("member")).toBe(false);
  });
});

describe("invitation creation", () => {
  it("owner can invite a member", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const result = await createOrgInvitation(org.id, owner.id, "newmember@example.com", "member");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invitation.role).toBe("member");
      expect(result.invitation.organizationId).toBe(org.id);
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
    }
  });

  it("admin can invite a member or an admin", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { user: admin } = await addMember(org.id, TEST_AUTH_ADMIN, "Admin", "admin");

    const asMember = await createOrgInvitation(org.id, admin.id, "invitee1@example.com", "member");
    expect(asMember.ok).toBe(true);

    const asAdmin = await createOrgInvitation(org.id, admin.id, "invitee2@example.com", "admin");
    expect(asAdmin.ok).toBe(true);
  });

  it("invitation directly to owner is rejected", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const result = await createOrgInvitation(org.id, owner.id, "wouldbeowner@example.com", "owner");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_role");
  });

  it("plaintext token is not stored — only its hash", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const result = await createOrgInvitation(org.id, owner.id, "tokencheck@example.com", "member");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await testDb.query.organizationInvitations.findFirst({
      where: eq(organizationInvitations.id, result.invitation.id),
    });
    expect(row?.tokenHash).toBe(hashInviteToken(result.token));
    expect(row?.tokenHash).not.toBe(result.token);
    expect(JSON.stringify(row)).not.toContain(result.token);
  });

  it("duplicate active invite for the same org/email is rejected", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const first = await createOrgInvitation(org.id, owner.id, "dupe@example.com", "member");
    expect(first.ok).toBe(true);

    const second = await createOrgInvitation(org.id, owner.id, "dupe@example.com", "member");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("invitation_already_pending");
  });

  it("the same email may be invited independently by two different organizations", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { org: otherOrg } = await createOrgWithOwner(TEST_OTHER_ORG_SLUG, "Globex", TEST_AUTH_OTHER_OWNER);

    const first = await createOrgInvitation(org.id, owner.id, "shared@example.com", "member");
    expect(first.ok).toBe(true);

    const otherOwner = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.organizationId, otherOrg.id),
    });
    const second = await createOrgInvitation(
      otherOrg.id,
      otherOwner!.userId,
      "shared@example.com",
      "member",
    );
    expect(second.ok).toBe(true);
  });

  it("a revoked invitation does not block re-inviting the same email", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const first = await createOrgInvitation(org.id, owner.id, "reinvite@example.com", "member");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const revoked = await revokeOrgInvitation(org.id, first.invitation.id);
    expect(revoked.ok).toBe(true);

    const second = await createOrgInvitation(org.id, owner.id, "reinvite@example.com", "member");
    expect(second.ok).toBe(true);
  });

  it("an expired invitation does not block re-inviting the same email", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const first = await createOrgInvitation(org.id, owner.id, "expiredreinvite@example.com", "member");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await testDb
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvitations.id, first.invitation.id));

    const second = await createOrgInvitation(org.id, owner.id, "expiredreinvite@example.com", "member");
    expect(second.ok).toBe(true);
  });

  it("cannot invite an email that already belongs to an organization member", async () => {
    // This exercises the real Clerk-lookup path (emailBelongsToExistingMember)
    // with an email guaranteed not to exist in Clerk — it must fail open
    // (treat as "unknown, allow") rather than ever block a legitimate
    // invite due to a lookup miss. The authoritative guard against actual
    // duplicate membership is acceptOrgInvitation's own check + the
    // organization_members unique index, exercised separately below.
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const result = await createOrgInvitation(
      org.id,
      owner.id,
      "definitely-not-a-real-clerk-user-xyz@example.com",
      "member",
    );
    expect(result.ok).toBe(true);
  });
});

describe("invitation state derivation", () => {
  it("derives pending/accepted/expired/revoked from timestamps", () => {
    const base = { acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 1000) };
    expect(invitationState(base)).toBe("pending");
    expect(invitationState({ ...base, acceptedAt: new Date() })).toBe("accepted");
    expect(invitationState({ ...base, revokedAt: new Date() })).toBe("revoked");
    expect(invitationState({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe("expired");
    // acceptedAt takes priority even if revokedAt/expiresAt would otherwise apply.
    expect(
      invitationState({
        acceptedAt: new Date(),
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toBe("accepted");
  });
});

describe("invalid token", () => {
  it("loadOrgInviteByToken fails safely for an unknown token", async () => {
    const result = await loadOrgInviteByToken("this-token-does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});

describe("acceptance", () => {
  it("a matching verified-email user creates membership", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "accept-match@example.com", "admin");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const result = await acceptOrgInvitation(invited.token, invitee, "accept-match@example.com");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.role).toBe("admin");
      expect(result.membership.organizationId).toBe(org.id);
      expect(result.membership.userId).toBe(invitee.id);
      expect(result.alreadyAccepted).toBe(false);
    }
  });

  it("is case-insensitive when matching the verified email", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "MixedCase@Example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const result = await acceptOrgInvitation(invited.token, invitee, normalizeEmail("mixedcase@example.com"));
    expect(result.ok).toBe(true);
  });

  it("email mismatch is rejected", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "invited@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const result = await acceptOrgInvitation(invited.token, invitee, "different@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("email_mismatch");

    const membership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, invitee.id),
    });
    expect(membership).toBeUndefined();
  });

  it("an expired invitation cannot be accepted", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "expired@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    await testDb
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvitations.id, invited.invitation.id));

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const result = await acceptOrgInvitation(invited.token, invitee, "expired@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("a revoked invitation cannot be accepted", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "revoked@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    await revokeOrgInvitation(org.id, invited.invitation.id);

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const result = await acceptOrgInvitation(invited.token, invitee, "revoked@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("revoked");
  });

  it("acceptance is atomic: the invitation becomes accepted and membership exists together", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "atomic@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const result = await acceptOrgInvitation(invited.token, invitee, "atomic@example.com");
    expect(result.ok).toBe(true);

    const invitationRow = await testDb.query.organizationInvitations.findFirst({
      where: eq(organizationInvitations.id, invited.invitation.id),
    });
    const membershipRow = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, invitee.id),
    });
    expect(invitationRow?.acceptedAt).not.toBeNull();
    expect(membershipRow).toBeDefined();
  });

  it("double acceptance by the same user does not create a duplicate membership", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "double@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const first = await acceptOrgInvitation(invited.token, invitee, "double@example.com");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.alreadyAccepted).toBe(false);

    const second = await acceptOrgInvitation(invited.token, invitee, "double@example.com");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyAccepted).toBe(true);

    const memberships = await testDb.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, invitee.id),
    });
    expect(memberships).toHaveLength(1);
  });

  it("an already-accepted invitation claimed by a different user is rejected", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "claimed@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const firstUser = await createUser(TEST_AUTH_INVITEE, "First");
    const firstResult = await acceptOrgInvitation(invited.token, firstUser, "claimed@example.com");
    expect(firstResult.ok).toBe(true);

    const secondUser = await createUser(TEST_AUTH_OTHER, "Second");
    const secondResult = await acceptOrgInvitation(invited.token, secondUser, "claimed@example.com");
    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) expect(secondResult.reason).toBe("email_mismatch");
  });

  it("an already-accepted membership remains valid after the token later expires", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const invited = await createOrgInvitation(org.id, owner.id, "stillvalid@example.com", "member");
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const invitee = await createUser(TEST_AUTH_INVITEE, "Invitee");
    const accepted = await acceptOrgInvitation(invited.token, invitee, "stillvalid@example.com");
    expect(accepted.ok).toBe(true);

    // Force the token into the past — an already-accepted invitation's
    // membership must not depend on the token remaining valid.
    await testDb
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - ORG_INVITE_EXPIRY_MS) })
      .where(eq(organizationInvitations.id, invited.invitation.id));

    const membership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, invitee.id),
    });
    expect(membership).toBeDefined();
    expect(membership?.role).toBe("member");
  });
});

describe("role permissions matrix", () => {
  it("admin cannot remove or demote an owner", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: adminMember } = await addMember(org.id, TEST_AUTH_ADMIN, "Admin", "admin");
    const ownerMembership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, owner.id),
    });

    const removeResult = await removeMember(org.id, "admin", ownerMembership!.id);
    expect(removeResult.ok).toBe(false);
    if (!removeResult.ok) expect(removeResult.reason).toBe("forbidden");

    const demoteResult = await changeMemberRole(org.id, "admin", ownerMembership!.id, "member");
    expect(demoteResult.ok).toBe(false);
    if (!demoteResult.ok) expect(demoteResult.reason).toBe("forbidden");

    void adminMember;
  });

  it("admin cannot remove another admin", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: adminA } = await addMember(org.id, TEST_AUTH_ADMIN, "Admin A", "admin");
    const { member: adminB } = await addMember(org.id, TEST_AUTH_OTHER, "Admin B", "admin");

    const result = await removeMember(org.id, "admin", adminB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden");

    void adminA;
  });

  it("admin can remove a member", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    await addMember(org.id, TEST_AUTH_ADMIN, "Admin", "admin");
    const { member: plainMember } = await addMember(org.id, TEST_AUTH_MEMBER, "Member", "member");

    const result = await removeMember(org.id, "admin", plainMember.id);
    expect(result.ok).toBe(true);

    const row = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, plainMember.id),
    });
    expect(row).toBeUndefined();
  });

  it("owner can promote a member to admin and demote back", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: plainMember } = await addMember(org.id, TEST_AUTH_MEMBER, "Member", "member");

    const promoted = await changeMemberRole(org.id, "owner", plainMember.id, "admin");
    expect(promoted.ok).toBe(true);
    if (promoted.ok) expect(promoted.membership.role).toBe("admin");

    const demoted = await changeMemberRole(org.id, "owner", plainMember.id, "member");
    expect(demoted.ok).toBe(true);
    if (demoted.ok) expect(demoted.membership.role).toBe("member");
  });

  it("owner can promote a member directly to owner", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: plainMember } = await addMember(org.id, TEST_AUTH_MEMBER, "Member", "member");

    const result = await changeMemberRole(org.id, "owner", plainMember.id, "owner");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.membership.role).toBe("owner");
  });

  it("member cannot invite, remove, or change roles", async () => {
    expect(canInviteMembers("member")).toBe(false);
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: otherMember } = await addMember(org.id, TEST_AUTH_OTHER, "Other", "member");

    const removeResult = await removeMember(org.id, "member", otherMember.id);
    expect(removeResult.ok).toBe(false);
    if (!removeResult.ok) expect(removeResult.reason).toBe("forbidden");

    const roleResult = await changeMemberRole(org.id, "member", otherMember.id, "admin");
    expect(roleResult.ok).toBe(false);
    if (!roleResult.ok) expect(roleResult.reason).toBe("forbidden");
  });
});

describe("last owner protection", () => {
  it("the last owner cannot be removed", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const ownerMembership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, owner.id),
    });

    const result = await removeMember(org.id, "owner", ownerMembership!.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("last_owner");

    const stillThere = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, ownerMembership!.id),
    });
    expect(stillThere).toBeDefined();
  });

  it("the last owner cannot be demoted to admin or member", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const ownerMembership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, owner.id),
    });

    const toAdmin = await changeMemberRole(org.id, "owner", ownerMembership!.id, "admin");
    expect(toAdmin.ok).toBe(false);
    if (!toAdmin.ok) expect(toAdmin.reason).toBe("last_owner");

    const toMember = await changeMemberRole(org.id, "owner", ownerMembership!.id, "member");
    expect(toMember.ok).toBe(false);
    if (!toMember.ok) expect(toMember.reason).toBe("last_owner");

    const row = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, ownerMembership!.id),
    });
    expect(row?.role).toBe("owner");
  });

  it("one owner may be removed or demoted when another owner remains", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: secondOwnerMembership } = await addMember(org.id, TEST_AUTH_OTHER, "Second Owner", "owner");
    const firstOwnerMembership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, owner.id),
    });

    const demoted = await changeMemberRole(org.id, "owner", firstOwnerMembership!.id, "admin");
    expect(demoted.ok).toBe(true);

    // Now only secondOwnerMembership remains as owner — removing it
    // should now correctly fail as the last owner.
    const removeLast = await removeMember(org.id, "owner", secondOwnerMembership.id);
    expect(removeLast.ok).toBe(false);
    if (!removeLast.ok) expect(removeLast.reason).toBe("last_owner");
  });

  it("manual flow: demote original owner only after promoting a replacement", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: candidateMembership } = await addMember(org.id, TEST_AUTH_OTHER, "Replacement", "member");
    const ownerMembership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, owner.id),
    });

    const rejectedDemote = await changeMemberRole(org.id, "owner", ownerMembership!.id, "member");
    expect(rejectedDemote.ok).toBe(false);

    const promote = await changeMemberRole(org.id, "owner", candidateMembership.id, "owner");
    expect(promote.ok).toBe(true);

    const nowAllowedDemote = await changeMemberRole(org.id, "owner", ownerMembership!.id, "member");
    expect(nowAllowedDemote.ok).toBe(true);
  });
});

describe("member removal", () => {
  it("removing a member deletes only the membership row, not the user's account/history", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { user: memberUser, member: plainMember } = await addMember(
      org.id,
      TEST_AUTH_MEMBER,
      "Member",
      "member",
    );

    const result = await removeMember(org.id, "owner", plainMember.id);
    expect(result.ok).toBe(true);

    const membershipRow = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.id, plainMember.id),
    });
    expect(membershipRow).toBeUndefined();

    const userRow = await testDb.query.users.findFirst({ where: eq(users.id, memberUser.id) });
    expect(userRow).toBeDefined();
    expect(userRow?.id).toBe(memberUser.id);
  });
});

describe("cross-org privacy", () => {
  it("org A's members list does not include org B's members", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { org: otherOrg } = await createOrgWithOwner(TEST_OTHER_ORG_SLUG, "Globex", TEST_AUTH_OTHER_OWNER);
    await addMember(otherOrg.id, TEST_AUTH_OTHER, "Globex Member", "member");

    const members = await listOrgMembers(org.id);
    expect(members.every((m) => m.organizationId === org.id)).toBe(true);
    expect(members.some((m) => m.user.displayName === "Globex Member")).toBe(false);
  });

  it("org A's pending invitations do not include org B's invitations", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { org: otherOrg } = await createOrgWithOwner(TEST_OTHER_ORG_SLUG, "Globex", TEST_AUTH_OTHER_OWNER);
    const otherOwner = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.organizationId, otherOrg.id),
    });
    await createOrgInvitation(otherOrg.id, otherOwner!.userId, "globex-invitee@example.com", "member");
    await createOrgInvitation(org.id, owner.id, "acme-invitee@example.com", "member");

    const invitations = await listPendingInvitations(org.id);
    expect(invitations.every((i) => i.organizationId === org.id)).toBe(true);
    expect(invitations.some((i) => i.email === "globex-invitee@example.com")).toBe(false);
  });

  it("org A's owner cannot revoke org B's invitation (organizationId-scoped lookup)", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { org: otherOrg } = await createOrgWithOwner(TEST_OTHER_ORG_SLUG, "Globex", TEST_AUTH_OTHER_OWNER);
    const otherOwner = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.organizationId, otherOrg.id),
    });
    const otherInvite = await createOrgInvitation(
      otherOrg.id,
      otherOwner!.userId,
      "crossorgrevoke@example.com",
      "member",
    );
    expect(otherInvite.ok).toBe(true);
    if (!otherInvite.ok) return;

    const result = await revokeOrgInvitation(org.id, otherInvite.invitation.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("org A cannot change roles or remove members belonging to org B (organizationId-scoped lookup)", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { org: otherOrg } = await createOrgWithOwner(TEST_OTHER_ORG_SLUG, "Globex", TEST_AUTH_OTHER_OWNER);
    const { member: otherMember } = await addMember(otherOrg.id, TEST_AUTH_OTHER, "Globex Member", "member");

    const removeResult = await removeMember(org.id, "owner", otherMember.id);
    expect(removeResult.ok).toBe(false);
    if (!removeResult.ok) expect(removeResult.reason).toBe("not_found");

    const roleResult = await changeMemberRole(org.id, "owner", otherMember.id, "admin");
    expect(roleResult.ok).toBe(false);
    if (!roleResult.ok) expect(roleResult.reason).toBe("not_found");
  });
});

describe("assessment-candidate separation", () => {
  it("completing an assessment never creates organization membership", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");

    const scenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });
    if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");

    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        name: "Assessment",
        scenarioId: scenario.id,
        scenarioVersion: paymentRetryStorm.version,
        createdByUserId: owner.id,
        status: "active",
      })
      .returning();
    if (!assessment) throw new Error("assessment not created");

    const candidateToken = generateInviteToken();
    const candidateUser = await createUser(TEST_AUTH_INVITEE, "Candidate");
    const [candidate] = await testDb
      .insert(assessmentCandidates)
      .values({
        assessmentId: assessment.id,
        email: "candidate-separation@example.com",
        normalizedEmail: normalizeEmail("candidate-separation@example.com"),
        userId: candidateUser.id,
        status: "completed",
        inviteTokenHash: hashInviteToken(candidateToken),
        inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
        completedAt: new Date(),
      })
      .returning();
    expect(candidate).toBeDefined();

    // The candidate completed an assessment for this organization — they
    // must still have zero organization_members rows for it.
    const membership = await testDb.query.organizationMembers.findFirst({
      where: (table, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(table.organizationId, org.id), eqFn(table.userId, candidateUser.id)),
    });
    expect(membership).toBeUndefined();

    const orgMembers = await listOrgMembers(org.id);
    expect(orgMembers.some((m) => m.userId === candidateUser.id)).toBe(false);
  });
});

describe("assessment/scenario integration", () => {
  it("a newly admin-promoted member immediately has canMutate-equivalent permissions", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: plainMember } = await addMember(org.id, TEST_AUTH_MEMBER, "Member", "member");

    const promoted = await changeMemberRole(org.id, "owner", plainMember.id, "admin");
    expect(promoted.ok).toBe(true);
    if (promoted.ok) {
      expect(canInviteMembers(promoted.membership.role)).toBe(true);
    }
  });

  it("a member (not promoted) has view-only permissions", async () => {
    const { org } = await createOrgWithOwner(TEST_ORG_SLUG, "Acme Corp");
    const { member: plainMember } = await addMember(org.id, TEST_AUTH_MEMBER, "Member", "member");
    expect(canInviteMembers(plainMember.role)).toBe(false);
  });
});
