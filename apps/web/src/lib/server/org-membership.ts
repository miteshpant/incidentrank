import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  organizationInvitations,
  organizationMembers,
  organizations,
  type Organization,
  type OrganizationInvitation,
  type OrganizationMember,
  type User,
} from "@incidentrank/db";
import { db } from "./db";
import { canChangeRole, canManageMember, type OrganizationRole } from "./organization-auth";
import { generateInviteToken, hashInviteToken, normalizeEmail } from "./invite-token";

/** Same 7-day expiry convention as assessment-candidate invitations (invite-token.ts's INVITE_EXPIRY_MS). */
export const ORG_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// ─────────────────────────────────────────────────────────────────────────
// Derived invitation state — no status enum/column, per the spec's
// "prefer fewer redundant state columns" guidance. A row's state is
// always computed from its timestamps:
//
//   acceptedAt != null → accepted
//   revokedAt  != null → revoked
//   now > expiresAt    → expired
//   otherwise          → pending
//
// acceptedAt is checked first so an already-accepted invitation is never
// reported as "revoked" or "expired" even if a caller later (incorrectly)
// tried to revoke it — once accepted, membership is authoritative and the
// invitation row becomes purely historical.
// ─────────────────────────────────────────────────────────────────────────

export type OrganizationInvitationState = "pending" | "accepted" | "expired" | "revoked";

export function invitationState(
  invitation: Pick<OrganizationInvitation, "acceptedAt" | "revokedAt" | "expiresAt">,
): OrganizationInvitationState {
  if (invitation.acceptedAt !== null) return "accepted";
  if (invitation.revokedAt !== null) return "revoked";
  if (invitation.expiresAt < new Date()) return "expired";
  return "pending";
}

function isActivePending(
  invitation: Pick<OrganizationInvitation, "acceptedAt" | "revokedAt" | "expiresAt">,
): boolean {
  return invitationState(invitation) === "pending";
}

// ─────────────────────────────────────────────────────────────────────────
// Invitation creation
// ─────────────────────────────────────────────────────────────────────────

export type CreateInvitationResult =
  | { ok: true; invitation: OrganizationInvitation; token: string }
  | { ok: false; reason: "invalid_role" }
  | { ok: false; reason: "already_member" }
  | { ok: false; reason: "invitation_already_pending" };

/**
 * Creates a new organization invitation. Enforces, in order: role must be
 * "owner", "admin", or "member" — Phase 10A widens this from the earlier
 * admin/member-only restriction so owner invitations are first-class
 * (an IncidentRank platform admin provisioning a new organization's
 * initial owner, or an existing owner inviting an additional owner — see
 * organization-provisioning.ts and organization-auth.ts's canInviteRole).
 * This function is mechanical only: it does NOT authorize who may request
 * an owner-role invite — that policy decision is made one layer up, by
 * the caller. Also checks the email does not already belong to a member
 * of this organization, and that there is no existing pending+unexpired
 * invitation for this exact (organizationId, normalizedEmail) pair. The
 * plaintext token is returned here only — the row stores just its
 * SHA-256 hash, mirroring assessment_candidates' invite-token security
 * pattern exactly.
 *
 * Accepts an optional `tx` (a transaction handle) for callers — like
 * organization-provisioning.ts's createOrganization and
 * inviteOwnerRecovery — that must insert the invitation atomically
 * alongside another write (e.g. the brand-new organization row itself).
 * Without this, a caller inside db.transaction(async (tx) => ...) that
 * invoked this function with the plain `db` singleton would run the
 * invitation insert on a separate connection that cannot yet see the
 * other write's uncommitted rows, surfacing as a spurious FK violation.
 */
export async function createOrgInvitation(
  organizationId: string,
  invitedByUserId: string,
  email: string,
  role: OrganizationRole,
  options?: { isRecoveryInvite?: boolean; tx?: TxOrDb },
): Promise<CreateInvitationResult> {
  const conn = options?.tx ?? db;

  if (role !== "owner" && role !== "admin" && role !== "member") {
    return { ok: false, reason: "invalid_role" };
  }

  const normalizedEmail = normalizeEmail(email);

  if (await emailBelongsToExistingMember(organizationId, normalizedEmail)) {
    return { ok: false, reason: "already_member" };
  }

  const existingInvitations = await conn.query.organizationInvitations.findMany({
    where: and(
      eq(organizationInvitations.organizationId, organizationId),
      eq(organizationInvitations.normalizedEmail, normalizedEmail),
    ),
  });
  if (existingInvitations.some((invite) => isActivePending(invite))) {
    return { ok: false, reason: "invitation_already_pending" };
  }

  const token = generateInviteToken();
  const [invitation] = await conn
    .insert(organizationInvitations)
    .values({
      organizationId,
      email,
      normalizedEmail,
      role,
      tokenHash: hashInviteToken(token),
      invitedByUserId,
      isRecoveryInvite: options?.isRecoveryInvite ?? false,
      expiresAt: new Date(Date.now() + ORG_INVITE_EXPIRY_MS),
    })
    .returning();
  if (!invitation) throw new Error("Failed to create invitation");

  return { ok: true, invitation, token };
}

/**
 * `users` has no email column of its own (identity lives in Clerk, per
 * docs/architecture.md), so "does this email already belong to a member"
 * cannot be answered from the local database alone. Resolves the email
 * to a Clerk user id via the Clerk backend SDK's getUserList, then checks
 * whether that identity's local `users` row (if any) is already a member
 * of this organization. This is a best-effort early rejection only — the
 * authoritative guard against duplicate membership is still
 * acceptOrgInvitation's own existing-membership check inside its
 * transaction (and organization_members' unique (organizationId,
 * userId) index), so a failure or race here can never allow a true
 * duplicate membership to form, only (rarely) allow an invitation to be
 * created for someone who happens to already be a member, which
 * acceptance will then simply treat as "already a member, return
 * existing membership" rather than erroring.
 */
async function emailBelongsToExistingMember(
  organizationId: string,
  normalizedEmail: string,
): Promise<boolean> {
  let clerkUsers;
  try {
    const client = await clerkClient();
    const response = await client.users.getUserList({ emailAddress: [normalizedEmail] });
    clerkUsers = response.data;
  } catch {
    // Clerk lookup failures (rate limit, transient network error) must
    // never block invitation creation — fall back to "unknown, allow the
    // invite," since acceptance-time checks remain authoritative.
    return false;
  }
  if (clerkUsers.length === 0) return false;

  const authProviderIds = clerkUsers.map((u) => u.id);
  const localUsers = await db.query.users.findMany({
    where: (table, { inArray }) => inArray(table.authProviderId, authProviderIds),
    columns: { id: true },
  });
  if (localUsers.length === 0) return false;

  const existingMembership = await db.query.organizationMembers.findFirst({
    where: (table, { inArray, and: andFn, eq: eqFn }) =>
      andFn(
        eqFn(table.organizationId, organizationId),
        inArray(
          table.userId,
          localUsers.map((u) => u.id),
        ),
      ),
  });
  return existingMembership !== undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────────────

export async function listOrgMembers(organizationId: string): Promise<
  Array<OrganizationMember & { user: User }>
> {
  const rows = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.organizationId, organizationId),
    with: { user: true },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  return rows.filter(
    (row): row is OrganizationMember & { user: User } => row.user !== null,
  );
}

/** Pending invitations only (expired/revoked/accepted are excluded) — the Members page's "Pending Invitations" list. */
export async function listPendingInvitations(
  organizationId: string,
): Promise<OrganizationInvitation[]> {
  const rows = await db.query.organizationInvitations.findMany({
    where: and(
      eq(organizationInvitations.organizationId, organizationId),
      isNull(organizationInvitations.acceptedAt),
      isNull(organizationInvitations.revokedAt),
    ),
    orderBy: [desc(organizationInvitations.createdAt)],
  });
  return rows.filter((row) => isActivePending(row));
}

// ─────────────────────────────────────────────────────────────────────────
// Revocation
// ─────────────────────────────────────────────────────────────────────────

export type RevokeInvitationResult =
  | { ok: true; invitation: OrganizationInvitation }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_pending" };

/** Accepted invitations can never be "revoked" as a substitute for removing membership — once accepted, the membership row is authoritative. */
export async function revokeOrgInvitation(
  organizationId: string,
  invitationId: string,
): Promise<RevokeInvitationResult> {
  const invitation = await db.query.organizationInvitations.findFirst({
    where: and(
      eq(organizationInvitations.id, invitationId),
      eq(organizationInvitations.organizationId, organizationId),
    ),
  });
  if (!invitation) return { ok: false, reason: "not_found" };
  if (!isActivePending(invitation)) return { ok: false, reason: "not_pending" };

  const [updated] = await db
    .update(organizationInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(organizationInvitations.id, invitationId))
    .returning();
  if (!updated) throw new Error("Failed to revoke invitation");

  return { ok: true, invitation: updated };
}

// ─────────────────────────────────────────────────────────────────────────
// Lookup by token (invitation landing page)
// ─────────────────────────────────────────────────────────────────────────

export type LoadOrgInviteResult =
  | { ok: true; invitation: OrganizationInvitation; organization: Organization }
  | { ok: false; reason: "not_found" };

export async function loadOrgInviteByToken(token: string): Promise<LoadOrgInviteResult> {
  const tokenHash = hashInviteToken(token);
  const invitation = await db.query.organizationInvitations.findFirst({
    where: eq(organizationInvitations.tokenHash, tokenHash),
    with: { organization: true },
  });
  if (!invitation || !invitation.organization) return { ok: false, reason: "not_found" };

  return { ok: true, invitation, organization: invitation.organization };
}

// ─────────────────────────────────────────────────────────────────────────
// Acceptance
// ─────────────────────────────────────────────────────────────────────────

export type AcceptOrgInvitationResult =
  | { ok: true; membership: OrganizationMember; alreadyAccepted: boolean; organizationActivated: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "revoked" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "email_mismatch" }
  | { ok: false; reason: "organization_suspended" };

/**
 * Accepts an invitation on behalf of `user`, whose `verifiedEmail` must
 * already have been confirmed by the caller (Clerk's verified primary
 * email — see the accept route) to case-insensitively match the
 * invitation's normalizedEmail before this is called; this function
 * re-checks it anyway as a second guard rather than trusting the caller
 * blindly. Runs as one DB transaction: verify → ensure no duplicate
 * membership → insert organization_members → mark the invitation
 * accepted → (if this is the organization's initial owner invitation)
 * transition the organization pending → active, so a reader can never
 * observe any of these without the others (docs/implementation_plan/
 * phase10a.md §35).
 *
 * Phase 10A suspension carve-out (§36): a normal (non-recovery)
 * invitation cannot be accepted while its organization is suspended —
 * this prevents new membership from silently activating mid-suspension.
 * An owner-recovery invitation (isRecoveryInvite: true, created only by
 * organization-provisioning.ts's inviteOwnerRecovery) is the one
 * exception, since recovering a suspended-and-ownerless organization is
 * exactly the support scenario the recovery override exists for.
 *
 * If the invitation was already accepted by this same user (e.g. a
 * double-submitted request), returns the existing membership rather than
 * erroring or creating a duplicate — matching the candidate-invite
 * accept route's same idempotent-reacceptance behavior.
 */
export async function acceptOrgInvitation(
  token: string,
  user: User,
  verifiedEmail: string,
): Promise<AcceptOrgInvitationResult> {
  const result = await loadOrgInviteByToken(token);
  if (!result.ok) return { ok: false, reason: "not_found" };
  const { invitation, organization } = result;

  if (invitation.acceptedAt !== null) {
    const existing = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, invitation.organizationId),
        eq(organizationMembers.userId, user.id),
      ),
    });
    if (existing) {
      return { ok: true, membership: existing, alreadyAccepted: true, organizationActivated: false };
    }
    // Accepted by a different user previously — never reopen or
    // reassign; report a safe "already accepted" state rather than
    // creating a second membership for this requester.
    return { ok: false, reason: "email_mismatch" };
  }

  if (invitation.revokedAt !== null) return { ok: false, reason: "revoked" };
  if (invitation.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (normalizeEmail(verifiedEmail) !== invitation.normalizedEmail) {
    return { ok: false, reason: "email_mismatch" };
  }
  if (organization.status === "suspended" && !invitation.isRecoveryInvite) {
    return { ok: false, reason: "organization_suspended" };
  }

  const { membership, organizationActivated } = await db.transaction(async (tx) => {
    const existing = await tx.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, invitation.organizationId),
        eq(organizationMembers.userId, user.id),
      ),
    });
    if (existing) return { membership: existing, organizationActivated: false };

    const [created] = await tx
      .insert(organizationMembers)
      .values({
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
      })
      .returning();
    if (!created) throw new Error("Failed to create membership");

    await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(organizationInvitations.id, invitation.id));

    // Phase 10A §35: accepting the initial owner invitation is what
    // activates a pending organization. Naturally idempotent (a second
    // accept of a different invite for an already-active org is simply a
    // no-op here, since the WHERE clause only matches status='pending')
    // and naturally scoped to only the initial-owner case — an
    // additional-owner invite is always accepted into an already-active
    // organization, so this condition never fires for it.
    let organizationActivated = false;
    if (invitation.role === "owner") {
      const [activated] = await tx
        .update(organizations)
        .set({ status: "active" })
        .where(and(eq(organizations.id, invitation.organizationId), eq(organizations.status, "pending")))
        .returning({ id: organizations.id });
      organizationActivated = activated !== undefined;
    }

    return { membership: created, organizationActivated };
  });

  return { ok: true, membership, alreadyAccepted: false, organizationActivated };
}

// ─────────────────────────────────────────────────────────────────────────
// Role changes / removal — last-owner protection
// ─────────────────────────────────────────────────────────────────────────

async function countOwners(organizationId: string): Promise<number> {
  const owners = await db.query.organizationMembers.findMany({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.role, "owner"),
    ),
    columns: { id: true },
  });
  return owners.length;
}

export type ChangeMemberRoleResult =
  | { ok: true; membership: OrganizationMember }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" }
  | { ok: false; reason: "last_owner" };

/**
 * Changes a member's role, enforcing canChangeRole's actor-role policy
 * and, independently, the last-owner invariant: an organization must
 * always have at least one owner, so demoting the sole remaining owner
 * (to admin or member) is rejected regardless of who the actor is —
 * this check is server-side and mandatory, never left to disabled UI
 * alone, per the spec's explicit requirement.
 */
export async function changeMemberRole(
  organizationId: string,
  actorRole: OrganizationRole,
  memberId: string,
  nextRole: OrganizationRole,
): Promise<ChangeMemberRoleResult> {
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId),
    ),
  });
  if (!member) return { ok: false, reason: "not_found" };

  if (!canChangeRole(actorRole)) {
    return { ok: false, reason: "forbidden" };
  }

  if (member.role === "owner" && nextRole !== "owner") {
    const ownerCount = await countOwners(organizationId);
    if (ownerCount <= 1) return { ok: false, reason: "last_owner" };
  }

  const [updated] = await db
    .update(organizationMembers)
    .set({ role: nextRole })
    .where(eq(organizationMembers.id, memberId))
    .returning();
  if (!updated) throw new Error("Failed to update member role");

  return { ok: true, membership: updated };
}

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" }
  | { ok: false; reason: "last_owner" };

/**
 * Removes a member from the organization. This deletes only the
 * organization_members association row — the user's IncidentRank
 * identity, practice history, and any other organizations' memberships
 * are entirely unaffected, per the architecture's "membership is a
 * relationship, not an account" principle.
 */
export async function removeMember(
  organizationId: string,
  actorRole: OrganizationRole,
  memberId: string,
): Promise<RemoveMemberResult> {
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.id, memberId),
      eq(organizationMembers.organizationId, organizationId),
    ),
  });
  if (!member) return { ok: false, reason: "not_found" };

  if (!canManageMember(actorRole, member.role)) {
    return { ok: false, reason: "forbidden" };
  }

  if (member.role === "owner") {
    const ownerCount = await countOwners(organizationId);
    if (ownerCount <= 1) return { ok: false, reason: "last_owner" };
  }

  await db.delete(organizationMembers).where(eq(organizationMembers.id, memberId));

  return { ok: true };
}
