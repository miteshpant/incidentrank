import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import {
  organizationInvitations,
  organizationMembers,
  organizations,
  type Organization,
  type OrganizationInvitation,
} from "@incidentrank/db";
import { db } from "./db";
import { logAdminAction } from "./admin-audit";
import { logOrgAuditEvent } from "./organization-audit";
import { createOrgInvitation, ORG_INVITE_EXPIRY_MS } from "./org-membership";
import { generateInviteToken, hashInviteToken } from "./invite-token";
import { slugify, randomSlugSuffix } from "./slug";
import { appBaseUrl } from "./app-url";
import {
  sendOrganizationOwnerInviteEmail,
  sendOrganizationReactivatedNotificationEmail,
  sendOrganizationSuspendedNotificationEmail,
} from "./email";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * users has no email column of its own (identity lives in Clerk) — every
 * owner-notification email in this module resolves the recipient's
 * current verified-ish primary email via the Clerk backend SDK by their
 * authProviderId, mirroring referral-qualification.ts's established
 * fire-and-forget notification pattern exactly: best-effort, never
 * throws, never blocks or reverts the real mutation it's attached to.
 */
async function resolveEmailForNotification(authProviderId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(authProviderId);
    return (
      clerkUser.emailAddresses.find((addr) => addr.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? null
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Organization creation (docs/implementation_plan/phase10a.md §5/§32).
// Only reachable via a platform-admin-gated route — see
// apps/web/src/app/api/admin/organizations/route.ts. Ordinary users can no
// longer create organizations at all (apps/web/src/app/api/organizations/
// route.ts's POST unconditionally rejects).
// ─────────────────────────────────────────────────────────────────────────

export type CreateOrganizationResult =
  | {
      ok: true;
      organization: Organization;
      invitation: OrganizationInvitation;
      token: string;
      emailSent: boolean;
    }
  | { ok: false; reason: "invalid_name" | "invalid_email" };

export async function createOrganization(input: {
  name: string;
  slug?: string;
  ownerEmail: string;
  createdByAdminUserId: string;
  createdByUserId: string;
  notes?: string;
}): Promise<CreateOrganizationResult> {
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, reason: "invalid_name" };

  const ownerEmail = input.ownerEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return { ok: false, reason: "invalid_email" };
  }

  const baseSlug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    if (!existing) break;
    slug = `${baseSlug}-${randomSlugSuffix()}`;
  }

  const { organization, invitation, token } = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        name,
        slug,
        status: "pending",
        createdByAdminUserId: input.createdByAdminUserId,
      })
      .returning();
    if (!org) throw new Error("Failed to create organization");

    const inviteResult = await createOrgInvitation(org.id, input.createdByUserId, ownerEmail, "owner", { tx });
    if (!inviteResult.ok) {
      // Only reachable if ownerEmail somehow collides with an existing
      // pending invite for a brand-new organization, which cannot happen
      // (the org was just created) — kept as a defensive throw rather than
      // a silently-swallowed branch.
      throw new Error(`Failed to create initial owner invitation: ${inviteResult.reason}`);
    }

    await logAdminAction(tx, {
      adminUserId: input.createdByUserId,
      action: "organization_created",
      targetType: "organization",
      targetId: org.id,
      // Phase 10D data-minimization: the owner's email is already
      // resolvable from the linked organization_invitation row (targetId
      // below) by email — never duplicate it into audit metadata.
      metadata: { name, slug },
    });
    await logOrgAuditEvent(tx, {
      organizationId: org.id,
      actorUserId: input.createdByUserId,
      actorType: "platform_admin",
      action: "organization_created",
      targetType: "organization",
      targetId: org.id,
      metadata: { notes: input.notes ?? null },
    });
    await logOrgAuditEvent(tx, {
      organizationId: org.id,
      actorUserId: input.createdByUserId,
      actorType: "platform_admin",
      action: "owner_invited",
      targetType: "organization_invitation",
      targetId: inviteResult.invitation.id,
      metadata: { initial: true },
    });

    return { organization: org, invitation: inviteResult.invitation, token: inviteResult.token };
  });

  const emailResult = await sendOrganizationOwnerInviteEmail({
    to: ownerEmail,
    organizationName: name,
    inviteUrl: `${appBaseUrl()}/organization/invite/${token}`,
    isAdditionalOwner: false,
  });

  return { ok: true, organization, invitation, token, emailSent: emailResult.ok };
}

// ─────────────────────────────────────────────────────────────────────────
// Suspension / reactivation (§16/§20). Owner notification is best-effort
// and happens strictly after the status-change transaction commits —
// §38's "do not make suspension depend on successful email delivery."
// ─────────────────────────────────────────────────────────────────────────

export type SuspendOrganizationResult =
  | { ok: true; organization: Organization }
  | { ok: false; reason: "invalid_reason" | "already_suspended" | "not_found" };

export async function suspendOrganization(input: {
  organizationId: string;
  reason: string;
  suspendedByAdminUserId: string;
  actingUserId: string;
}): Promise<SuspendOrganizationResult> {
  const reason = input.reason.trim();
  if (reason.length === 0) return { ok: false, reason: "invalid_reason" };

  const organization = await db.transaction(async (tx) => {
    const existing = await tx.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });
    if (!existing) return null;
    if (existing.status === "suspended") return "already_suspended" as const;

    const [updated] = await tx
      .update(organizations)
      .set({
        status: "suspended",
        suspendedAt: new Date(),
        suspendedByAdminUserId: input.suspendedByAdminUserId,
        suspensionReason: reason,
      })
      .where(eq(organizations.id, input.organizationId))
      .returning();
    if (!updated) throw new Error("Failed to suspend organization");

    await logAdminAction(tx, {
      adminUserId: input.actingUserId,
      action: "organization_suspended",
      targetType: "organization",
      targetId: updated.id,
      metadata: { reason },
    });
    await logOrgAuditEvent(tx, {
      organizationId: updated.id,
      actorUserId: input.actingUserId,
      actorType: "platform_admin",
      action: "organization_suspended",
      targetType: "organization",
      targetId: updated.id,
      metadata: { reason },
    });

    return updated;
  });

  if (organization === null) return { ok: false, reason: "not_found" };
  if (organization === "already_suspended") return { ok: false, reason: "already_suspended" };

  void notifyOwners(organization, reason);

  return { ok: true, organization };
}

async function notifyOwners(organization: Organization, suspensionReason: string): Promise<void> {
  const owners = await db.query.organizationMembers.findMany({
    where: and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.role, "owner")),
    with: { user: true },
  });
  for (const owner of owners) {
    if (!owner.user) continue;
    const email = await resolveEmailForNotification(owner.user.authProviderId);
    if (!email) continue;
    await sendOrganizationSuspendedNotificationEmail({
      to: email,
      organizationName: organization.name,
      reason: suspensionReason,
    });
  }
}

export type ReactivateOrganizationResult =
  | { ok: true; organization: Organization }
  | { ok: false; reason: "not_suspended" | "not_found" };

export async function reactivateOrganization(input: {
  organizationId: string;
  reactivatedByAdminUserId: string;
  actingUserId: string;
}): Promise<ReactivateOrganizationResult> {
  const organization = await db.transaction(async (tx) => {
    const existing = await tx.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });
    if (!existing) return null;
    if (existing.status !== "suspended") return "not_suspended" as const;

    const [updated] = await tx
      .update(organizations)
      .set({ status: "active", reactivatedAt: new Date() })
      .where(eq(organizations.id, input.organizationId))
      .returning();
    if (!updated) throw new Error("Failed to reactivate organization");

    await logAdminAction(tx, {
      adminUserId: input.actingUserId,
      action: "organization_reactivated",
      targetType: "organization",
      targetId: updated.id,
    });
    await logOrgAuditEvent(tx, {
      organizationId: updated.id,
      actorUserId: input.actingUserId,
      actorType: "platform_admin",
      action: "organization_reactivated",
      targetType: "organization",
      targetId: updated.id,
    });

    return updated;
  });

  if (organization === null) return { ok: false, reason: "not_found" };
  if (organization === "not_suspended") return { ok: false, reason: "not_suspended" };

  void notifyOwnersReactivated(organization);

  return { ok: true, organization };
}

async function notifyOwnersReactivated(organization: Organization): Promise<void> {
  const owners = await db.query.organizationMembers.findMany({
    where: and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.role, "owner")),
    with: { user: true },
  });
  for (const owner of owners) {
    if (!owner.user) continue;
    const email = await resolveEmailForNotification(owner.user.authProviderId);
    if (!email) continue;
    await sendOrganizationReactivatedNotificationEmail({
      to: email,
      organizationName: organization.name,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Owner-invite resend (§10/§54) and owner-recovery override (§15, §34,
// §36 — implemented now per binding scope decision, not deferred).
// ─────────────────────────────────────────────────────────────────────────

export type ResendOwnerInviteResult =
  | { ok: true; invitation: OrganizationInvitation; token: string; emailSent: boolean }
  | { ok: false; reason: "not_found" | "no_pending_owner_invite" };

/**
 * Resends the organization's current pending owner invitation email.
 * Never rotates the token (§10's "resend uses same invitation") — the
 * plaintext token itself is never stored after creation (mirrors every
 * other invite-token flow in this codebase), so "resend" here means
 * re-sending email to the SAME invitation's email address with a FRESH
 * token that supersedes the original (the original token's hash is
 * overwritten on the same row, invalidating any copy of the old link the
 * admin may still be holding) — this is the only way to genuinely
 * "resend" without ever having persisted the plaintext. The invitation
 * row itself — its id, audit history, and role — is unchanged; only its
 * tokenHash and expiresAt are refreshed.
 */
export async function resendOwnerInvite(input: {
  organizationId: string;
  actingUserId: string;
}): Promise<ResendOwnerInviteResult> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) return { ok: false, reason: "not_found" };

  const pending = await db.query.organizationInvitations.findFirst({
    where: and(
      eq(organizationInvitations.organizationId, input.organizationId),
      eq(organizationInvitations.role, "owner"),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  if (
    !pending ||
    pending.acceptedAt !== null ||
    pending.revokedAt !== null
  ) {
    return { ok: false, reason: "no_pending_owner_invite" };
  }

  const newToken = generateInviteToken();

  const refreshed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(organizationInvitations)
      .set({
        tokenHash: hashInviteToken(newToken),
        expiresAt: new Date(Date.now() + ORG_INVITE_EXPIRY_MS),
      })
      .where(eq(organizationInvitations.id, pending.id))
      .returning();
    if (!updated) throw new Error("Failed to refresh invitation");

    await logAdminAction(tx, {
      adminUserId: input.actingUserId,
      action: "owner_invited",
      targetType: "organization_invitation",
      targetId: updated.id,
      // Phase 10D data-minimization: updated.email is already stored on
      // the invitation row itself (targetId) — no need to duplicate it.
      metadata: { resend: true },
    });
    await logOrgAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actingUserId,
      actorType: "platform_admin",
      action: "owner_invited",
      targetType: "organization_invitation",
      targetId: updated.id,
      metadata: { resend: true },
    });

    return updated;
  });

  const emailResult = await sendOrganizationOwnerInviteEmail({
    to: refreshed.email,
    organizationName: organization.name,
    inviteUrl: `${appBaseUrl()}/organization/invite/${newToken}`,
    isAdditionalOwner: false,
  });

  return { ok: true, invitation: refreshed, token: newToken, emailSent: emailResult.ok };
}

export type InviteOwnerRecoveryResult =
  | { ok: true; invitation: OrganizationInvitation; token: string; emailSent: boolean }
  | { ok: false; reason: "not_found" | "invalid_email" | "invalid_reason" };

/**
 * The owner-recovery override (§15/§34/§36): allowed regardless of the
 * organization's current status, including suspended — this is precisely
 * the support path for a suspended-and-effectively-ownerless organization.
 * Always audited under the distinct action string owner_recovery_invited
 * (never owner_invited), with a required human-entered reason, and the
 * resulting invitation is flagged isRecoveryInvite: true so
 * acceptOrgInvitation's suspension carve-out (org-membership.ts) permits
 * its acceptance even while the organization is still suspended. Never
 * bypasses the >=1-owner invariant — this only ever creates an
 * additional invite, never force-removes or reassigns an existing owner.
 */
export async function inviteOwnerRecovery(input: {
  organizationId: string;
  email: string;
  reason: string;
  invitedByUserId: string;
}): Promise<InviteOwnerRecoveryResult> {
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "invalid_email" };
  }
  const reason = input.reason.trim();
  if (reason.length === 0) return { ok: false, reason: "invalid_reason" };

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) return { ok: false, reason: "not_found" };

  const { invitation, token } = await db.transaction(async (tx) => {
    const inviteResult = await createOrgInvitation(
      input.organizationId,
      input.invitedByUserId,
      email,
      "owner",
      { isRecoveryInvite: true, tx },
    );
    if (!inviteResult.ok) {
      throw new Error(`Failed to create recovery invitation: ${inviteResult.reason}`);
    }

    await logAdminAction(tx, {
      adminUserId: input.invitedByUserId,
      action: "owner_recovery_invited",
      targetType: "organization_invitation",
      targetId: inviteResult.invitation.id,
      // Phase 10D data-minimization: email is already stored on the
      // invitation row itself (targetId) — no need to duplicate it.
      metadata: { reason },
    });
    await logOrgAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.invitedByUserId,
      actorType: "platform_admin",
      action: "owner_recovery_invited",
      targetType: "organization_invitation",
      targetId: inviteResult.invitation.id,
      metadata: { reason },
    });

    return { invitation: inviteResult.invitation, token: inviteResult.token };
  });

  const emailResult = await sendOrganizationOwnerInviteEmail({
    to: email,
    organizationName: organization.name,
    inviteUrl: `${appBaseUrl()}/organization/invite/${token}`,
    isAdditionalOwner: true,
  });

  return { ok: true, invitation, token, emailSent: emailResult.ok };
}

export type { TxOrDb };
