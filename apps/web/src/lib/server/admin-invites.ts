import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { adminInvites, adminUsers, type AdminInvite, type AdminUser, type User } from "@incidentrank/db";
import { db } from "./db";
import { generateInviteToken, hashInviteToken, normalizeEmail } from "./invite-token";
import { isIncidentRankDomainEmail, type AdminRole } from "./admin-auth";

const ADMIN_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type CreateAdminInviteResult =
  | { ok: true; invite: AdminInvite; token: string }
  | { ok: false; reason: "invalid_domain" };

/**
 * Creates an admin invite. Domain validation happens here, at creation
 * time — never at acceptance time only — per docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.3/§4.4 ("Reject
 * external-domain admin invitations"). Mirrors the assessment-candidate/
 * organization-invite token pattern exactly: the raw token is returned
 * once here and never persisted — only its SHA-256 hash is stored.
 */
export async function createAdminInvite(input: {
  email: string;
  role: AdminRole;
  invitedByUserId: string;
}): Promise<CreateAdminInviteResult> {
  if (!isIncidentRankDomainEmail(input.email)) {
    return { ok: false, reason: "invalid_domain" };
  }

  const token = generateInviteToken();
  const [invite] = await db
    .insert(adminInvites)
    .values({
      email: input.email,
      role: input.role,
      tokenHash: hashInviteToken(token),
      invitedByUserId: input.invitedByUserId,
      expiresAt: new Date(Date.now() + ADMIN_INVITE_EXPIRY_MS),
    })
    .returning();
  if (!invite) throw new Error("Failed to create admin invite");

  return { ok: true, invite, token };
}

export type LoadAdminInviteResult =
  | { ok: true; invite: AdminInvite }
  | { ok: false; reason: "not_found" };

export async function loadAdminInviteByToken(token: string): Promise<LoadAdminInviteResult> {
  const tokenHash = hashInviteToken(token);
  const invite = await db.query.adminInvites.findFirst({
    where: eq(adminInvites.tokenHash, tokenHash),
  });
  if (!invite) return { ok: false, reason: "not_found" };
  return { ok: true, invite };
}

export type AcceptAdminInviteResult =
  | { ok: true; membership: AdminUser; alreadyAccepted: boolean }
  | { ok: false; reason: "revoked" | "expired" | "email_mismatch" | "wrong_domain" };

/**
 * Accepts an admin invite, creating the adminUsers membership row.
 * Idempotent for the same already-accepted user (mirrors
 * acceptOrgInvitation's pattern in org-membership.ts) — a repeated
 * accept request by the same person returns the existing membership
 * rather than erroring or duplicating.
 */
export async function acceptAdminInvite(
  invite: AdminInvite,
  user: User,
  verifiedEmail: string | null,
): Promise<AcceptAdminInviteResult> {
  if (invite.acceptedByUserId !== null) {
    const existing = await db.query.adminUsers.findFirst({
      where: and(eq(adminUsers.userId, invite.acceptedByUserId), isNull(adminUsers.revokedAt)),
    });
    if (invite.acceptedByUserId === user.id && existing) {
      return { ok: true, membership: existing, alreadyAccepted: true };
    }
    return { ok: false, reason: "email_mismatch" };
  }

  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "expired" || invite.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (!verifiedEmail || normalizeEmail(verifiedEmail) !== normalizeEmail(invite.email)) {
    return { ok: false, reason: "email_mismatch" };
  }
  if (!isIncidentRankDomainEmail(verifiedEmail)) {
    return { ok: false, reason: "wrong_domain" };
  }

  const membership = await db.transaction(async (tx) => {
    const existing = await tx.query.adminUsers.findFirst({
      where: and(eq(adminUsers.userId, user.id), isNull(adminUsers.revokedAt)),
    });
    if (existing) return existing;

    const [created] = await tx
      .insert(adminUsers)
      .values({ userId: user.id, role: invite.role, createdByUserId: invite.invitedByUserId })
      .returning();
    if (!created) throw new Error("Failed to create admin membership");

    await tx
      .update(adminInvites)
      .set({ status: "accepted", acceptedByUserId: user.id, acceptedAt: new Date() })
      .where(eq(adminInvites.id, invite.id));

    return created;
  });

  return { ok: true, membership, alreadyAccepted: false };
}
