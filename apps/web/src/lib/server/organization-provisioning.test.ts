import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  adminAuditEvents,
  adminUsers,
  organizationAuditEvents,
  organizationInvitations,
  organizationMembers,
  organizations,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  createOrganization,
  inviteOwnerRecovery,
  reactivateOrganization,
  resendOwnerInvite,
  suspendOrganization,
} from "./organization-provisioning";
import { acceptOrgInvitation, loadOrgInviteByToken } from "./org-membership";

/**
 * Integration tests against local Postgres for Phase 10A's organization
 * provisioning module (docs/implementation_plan/phase10a.md §62/§64):
 * creation (pending status + initial owner invite), suspension/
 * reactivation (audit trail + email-independent commit), owner-invite
 * resend (same row, fresh token), and the owner-recovery override
 * (works even while suspended, distinct audit action).
 */

let testDb: Db;

const TEST_AUTH_ADMIN = "test-org-provisioning-admin";
const TEST_AUTH_OWNER = "test-org-provisioning-owner-invitee";
const TEST_ORG_SLUG_PREFIX = "test-org-provisioning-";

beforeAll(() => {
  testDb = createDb();
});

afterEach(async () => {
  const orgs = await testDb.query.organizations.findMany({
    where: (table, { like }) => like(table.slug, `${TEST_ORG_SLUG_PREFIX}%`),
  });
  for (const org of orgs) {
    await testDb.delete(organizationAuditEvents).where(eq(organizationAuditEvents.organizationId, org.id));
    await testDb.delete(organizationInvitations).where(eq(organizationInvitations.organizationId, org.id));
    await testDb.delete(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
    await testDb.delete(organizations).where(eq(organizations.id, org.id));
  }

  const admin = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_ADMIN) });
  if (admin) {
    await testDb.delete(adminAuditEvents).where(eq(adminAuditEvents.adminUserId, admin.id));
    await testDb.delete(adminUsers).where(eq(adminUsers.userId, admin.id));
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ADMIN));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createPlatformAdmin() {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_ADMIN, displayName: "Platform Admin" })
    .returning();
  if (!user) throw new Error("admin user not created");
  const [membership] = await testDb
    .insert(adminUsers)
    .values({ userId: user.id, role: "admin" })
    .returning();
  if (!membership) throw new Error("admin membership not created");
  return { user, membership };
}

function uniqueSlug() {
  return `${TEST_ORG_SLUG_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
}

describe("createOrganization (phase10a.md §5/§32/§62)", () => {
  it("creates the organization with status pending and a pending owner invitation", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const slug = uniqueSlug();

    const result = await createOrganization({
      name: "Test Org Provisioning Co",
      slug,
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.organization.status).toBe("pending");
    expect(result.organization.createdByAdminUserId).toBe(membership.id);
    expect(result.organization.slug).toBe(slug);
    expect(result.invitation.role).toBe("owner");
    expect(result.invitation.email).toBe("owner-invitee@example.com");
    expect(result.token.length).toBeGreaterThan(0);

    const auditEvents = await testDb.query.organizationAuditEvents.findMany({
      where: eq(organizationAuditEvents.organizationId, result.organization.id),
    });
    const actions = auditEvents.map((e) => e.action);
    expect(actions).toContain("organization_created");
    expect(actions).toContain("owner_invited");
  });

  it("rejects an empty name", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const result = await createOrganization({
      name: "   ",
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_name");
  });

  it("rejects an invalid owner email", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const result = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "not-an-email",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_email");
  });

  it("auto-suffixes the slug on collision rather than failing", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const baseSlug = uniqueSlug();

    const first = await createOrganization({
      name: "First Org",
      slug: baseSlug,
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    expect(first.ok).toBe(true);

    const second = await createOrganization({
      name: "Second Org",
      slug: baseSlug,
      ownerEmail: "owner-invitee+2@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.organization.slug).not.toBe(first.organization.slug);
      expect(second.organization.slug.startsWith(baseSlug)).toBe(true);
    }
  });
});

describe("acceptOrgInvitation — pending → active transition (phase10a.md §35)", () => {
  it("activates the organization when the initial owner invitation is accepted", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [ownerUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "New Owner" })
      .returning();
    if (!ownerUser) throw new Error("owner user not created");

    const result = await acceptOrgInvitation(created.token, ownerUser, "owner-invitee@example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.organizationActivated).toBe(true);
      expect(result.membership.role).toBe("owner");
    }

    const org = await testDb.query.organizations.findFirst({
      where: eq(organizations.id, created.organization.id),
    });
    expect(org?.status).toBe("active");
  });
});

describe("suspendOrganization / reactivateOrganization (phase10a.md §16/§20/§64)", () => {
  it("suspends an active organization, requires a reason, and writes both audit trails", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");

    await testDb.update(organizations).set({ status: "active" }).where(eq(organizations.id, created.organization.id));

    const emptyReason = await suspendOrganization({
      organizationId: created.organization.id,
      reason: "   ",
      suspendedByAdminUserId: membership.id,
      actingUserId: admin.id,
    });
    expect(emptyReason.ok).toBe(false);
    if (!emptyReason.ok) expect(emptyReason.reason).toBe("invalid_reason");

    const result = await suspendOrganization({
      organizationId: created.organization.id,
      reason: "Non-payment",
      suspendedByAdminUserId: membership.id,
      actingUserId: admin.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.organization.status).toBe("suspended");
      expect(result.organization.suspensionReason).toBe("Non-payment");
    }

    const adminEvents = await testDb.query.adminAuditEvents.findMany({
      where: and(eq(adminAuditEvents.adminUserId, admin.id), eq(adminAuditEvents.action, "organization_suspended")),
    });
    expect(adminEvents.length).toBeGreaterThan(0);

    const orgEvents = await testDb.query.organizationAuditEvents.findMany({
      where: and(
        eq(organizationAuditEvents.organizationId, created.organization.id),
        eq(organizationAuditEvents.action, "organization_suspended"),
      ),
    });
    expect(orgEvents.length).toBe(1);
  });

  it("rejects suspending an already-suspended organization", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");
    await testDb
      .update(organizations)
      .set({ status: "suspended", suspensionReason: "already" })
      .where(eq(organizations.id, created.organization.id));

    const result = await suspendOrganization({
      organizationId: created.organization.id,
      reason: "Second attempt",
      suspendedByAdminUserId: membership.id,
      actingUserId: admin.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_suspended");
  });

  it("reactivates a suspended organization and rejects reactivating a non-suspended one", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");
    await testDb
      .update(organizations)
      .set({ status: "suspended", suspensionReason: "test" })
      .where(eq(organizations.id, created.organization.id));

    const result = await reactivateOrganization({
      organizationId: created.organization.id,
      reactivatedByAdminUserId: membership.id,
      actingUserId: admin.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.organization.status).toBe("active");

    const secondAttempt = await reactivateOrganization({
      organizationId: created.organization.id,
      reactivatedByAdminUserId: membership.id,
      actingUserId: admin.id,
    });
    expect(secondAttempt.ok).toBe(false);
    if (!secondAttempt.ok) expect(secondAttempt.reason).toBe("not_suspended");
  });

  it("returns not_found for a nonexistent organization id", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const result = await suspendOrganization({
      organizationId: "00000000-0000-0000-0000-000000000000",
      reason: "test",
      suspendedByAdminUserId: membership.id,
      actingUserId: admin.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});

describe("resendOwnerInvite (phase10a.md §10/§54)", () => {
  it("refreshes the same invitation row rather than creating a duplicate", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await resendOwnerInvite({
      organizationId: created.organization.id,
      actingUserId: admin.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invitation.id).toBe(created.invitation.id);
      expect(result.invitation.email).toBe(created.invitation.email);
    }

    const allInvites = await testDb.query.organizationInvitations.findMany({
      where: eq(organizationInvitations.organizationId, created.organization.id),
    });
    expect(allInvites.length).toBe(1);

    // the old token must no longer resolve, since the hash was rotated
    const oldTokenLookup = await loadOrgInviteByToken(created.token);
    expect(oldTokenLookup.ok).toBe(false);
  });

  it("returns no_pending_owner_invite once the owner invitation has been accepted", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");

    const [ownerUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "New Owner" })
      .returning();
    if (!ownerUser) throw new Error("owner user not created");
    await acceptOrgInvitation(created.token, ownerUser, "owner-invitee@example.com");

    const result = await resendOwnerInvite({
      organizationId: created.organization.id,
      actingUserId: admin.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_pending_owner_invite");
  });
});

describe("inviteOwnerRecovery (phase10a.md §15/§34/§36)", () => {
  it("creates a recovery invitation that is acceptable even while the organization is suspended", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");
    await testDb
      .update(organizations)
      .set({ status: "suspended", suspensionReason: "ownerless" })
      .where(eq(organizations.id, created.organization.id));

    const recovery = await inviteOwnerRecovery({
      organizationId: created.organization.id,
      email: "recovery-owner@example.com",
      reason: "Original owner unreachable",
      invitedByUserId: admin.id,
    });
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) return;

    // inviteOwnerRecovery deliberately never returns the plaintext token
    // (consistent with every other invite flow never persisting it) — so
    // acceptance is exercised generically via createOrganization's token
    // in the sibling test above; here we assert the row-level invariants
    // the recovery path is responsible for: isRecoveryInvite is set, the
    // suspended organization is untouched by merely sending the invite,
    // and the audit action is the distinct owner_recovery_invited string.
    expect(recovery.invitation.isRecoveryInvite).toBe(true);
    expect(recovery.invitation.email).toBe("recovery-owner@example.com");

    const orgAfter = await testDb.query.organizations.findFirst({
      where: eq(organizations.id, created.organization.id),
    });
    expect(orgAfter?.status).toBe("suspended");

    const orgEvents = await testDb.query.organizationAuditEvents.findMany({
      where: and(
        eq(organizationAuditEvents.organizationId, created.organization.id),
        eq(organizationAuditEvents.action, "owner_recovery_invited"),
      ),
    });
    expect(orgEvents.length).toBe(1);

    const adminEvents = await testDb.query.adminAuditEvents.findMany({
      where: and(eq(adminAuditEvents.adminUserId, admin.id), eq(adminAuditEvents.action, "owner_recovery_invited")),
    });
    expect(adminEvents.length).toBe(1);
  });

  it("a recovery invitation set isRecoveryInvite true, which acceptOrgInvitation's carve-out keys on", async () => {
    // Directly exercises the carve-out logic in org-membership.ts using a
    // hand-built invitation row, since inviteOwnerRecovery itself never
    // returns a plaintext token to accept with (see note above).
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");
    await testDb
      .update(organizations)
      .set({ status: "suspended", suspensionReason: "ownerless" })
      .where(eq(organizations.id, created.organization.id));

    // The initial owner invitation itself is NOT a recovery invite —
    // flip it to simulate what inviteOwnerRecovery's created row would
    // look like, then prove acceptance succeeds specifically because of
    // that flag while the organization remains suspended.
    await testDb
      .update(organizationInvitations)
      .set({ isRecoveryInvite: true })
      .where(eq(organizationInvitations.id, created.invitation.id));

    const [recoveryUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Recovery Owner" })
      .returning();
    if (!recoveryUser) throw new Error("recovery user not created");

    const accepted = await acceptOrgInvitation(created.token, recoveryUser, "owner-invitee@example.com");
    expect(accepted.ok).toBe(true);

    const orgAfter = await testDb.query.organizations.findFirst({
      where: eq(organizations.id, created.organization.id),
    });
    expect(orgAfter?.status).toBe("suspended");
  });

  it("a normal (non-recovery) owner invitation cannot be accepted while suspended", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");
    await testDb
      .update(organizations)
      .set({ status: "suspended", suspensionReason: "test" })
      .where(eq(organizations.id, created.organization.id));

    const [ownerUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "New Owner" })
      .returning();
    if (!ownerUser) throw new Error("owner user not created");

    const result = await acceptOrgInvitation(created.token, ownerUser, "owner-invitee@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("organization_suspended");
  });

  it("rejects an invalid email or empty reason", async () => {
    const { user: admin, membership } = await createPlatformAdmin();
    const created = await createOrganization({
      name: "Test Org Provisioning Co",
      slug: uniqueSlug(),
      ownerEmail: "owner-invitee@example.com",
      createdByAdminUserId: membership.id,
      createdByUserId: admin.id,
    });
    if (!created.ok) throw new Error("setup failed");

    const badEmail = await inviteOwnerRecovery({
      organizationId: created.organization.id,
      email: "not-an-email",
      reason: "test",
      invitedByUserId: admin.id,
    });
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) expect(badEmail.reason).toBe("invalid_email");

    const badReason = await inviteOwnerRecovery({
      organizationId: created.organization.id,
      email: "recovery-owner@example.com",
      reason: "   ",
      invitedByUserId: admin.id,
    });
    expect(badReason.ok).toBe(false);
    if (!badReason.ok) expect(badReason.reason).toBe("invalid_reason");
  });
});
