import "server-only";
import { and, eq } from "drizzle-orm";
import {
  organizationMembers,
  organizations,
  type Organization,
  type OrganizationMember,
  type User,
} from "@incidentrank/db";
import { db } from "./db";

export type OrganizationRole = OrganizationMember["role"];

export type LoadOrganizationResult =
  | { ok: true; organization: Organization; membership: OrganizationMember }
  | { ok: false; status: 404 | 403 };

/**
 * Loads an organization by slug and verifies the given user is a member.
 * Every organization route/API must call this (or requireOrganizationRole
 * below) — never trust a client-supplied organization id/slug alone.
 */
export async function loadOrganizationMembership(
  slug: string,
  user: User,
): Promise<LoadOrganizationResult> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  if (!organization) return { ok: false, status: 404 };

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organization.id),
      eq(organizationMembers.userId, user.id),
    ),
  });
  if (!membership) return { ok: false, status: 403 };

  return { ok: true, organization, membership };
}

const MUTATION_ROLES: ReadonlySet<OrganizationRole> = new Set([
  "owner",
  "admin",
]);

/** owner/admin may create assessments, invite candidates, close assessments. */
export function canMutate(role: OrganizationRole): boolean {
  return MUTATION_ROLES.has(role);
}

/** Only an owner may manage organization-level settings (e.g. future billing). */
export function isOwner(role: OrganizationRole): boolean {
  return role === "owner";
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 5.2 — membership authorization policy. Deliberately explicit,
// named functions rather than scattered `role === "owner" || role ===
// "admin"` checks sprinkled through routes — every membership-mutating
// route calls exactly one of these, so the policy lives in one place and
// is unit-testable on its own (see organization-auth.test.ts).
// ─────────────────────────────────────────────────────────────────────────

/** owner/admin may create invitations. member may not. */
export function canInviteMembers(role: OrganizationRole): boolean {
  return MUTATION_ROLES.has(role);
}

/**
 * Phase 10A §11: invite permission now depends on the TARGET role, not
 * just the actor's role — an owner may invite anyone (including another
 * owner), an admin may invite an admin or member but never an owner, and
 * a member may invite no one. This is the precise policy
 * canInviteMembers (role-blind) cannot express; the one call site that
 * needs target-role precision (the member-invitations route) uses this
 * instead.
 */
export function canInviteRole(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return false;
}

/**
 * Whether `actorRole` may remove the member currently holding
 * `targetRole` (last-owner protection is enforced separately, by the
 * caller checking remaining-owner count — this function only encodes the
 * role-pair policy, not organization-wide invariants):
 *
 *   owner → can remove admin or member, and can remove another owner
 *           (last-owner protection applies separately)
 *   admin → can remove member only; cannot remove admin or owner
 *   member → cannot remove anyone
 */
export function canManageMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "member";
  return false;
}

/**
 * Whether `actorRole` may change any member's role (promote/demote,
 * including to/from owner). Role mutations are owner-only, per the
 * spec's "Keep ownership mutations owner-only" — admins have no
 * role-change capability at all, keeping the permission model simple
 * rather than carving out a partial admin role-change allowance. Takes
 * only `actorRole` since the policy does not depend on which role is
 * being changed to which — target/next role distinctions, if ever
 * needed, belong in a future, separately-named policy function rather
 * than unused parameters here. Last-owner protection (an organization
 * must always have at least one owner) is enforced separately by the
 * caller.
 */
export function canChangeRole(actorRole: OrganizationRole): boolean {
  return actorRole === "owner";
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 10A — organization lifecycle gating. Deliberately separate from
// loadOrganizationMembership/canMutate above: read access (viewing
// scenarios/assessments/reports) must keep working for a suspended
// organization (historical data stays intact and visible — phase10a.md
// §19/§30), while mutation routes must additionally pass
// requireActiveOrganization. Never call this from a GET/read route.
// ─────────────────────────────────────────────────────────────────────────

export type RequireActiveOrganizationResult =
  | { ok: true }
  | { ok: false; status: 403; reason: "organization_suspended" }
  | { ok: false; status: 403; reason: "organization_pending" };

/**
 * Every organization mutation route (scenario create/edit/publish,
 * assessment create, candidate invite, member/owner invite creation,
 * role change, member removal) must call this in addition to its
 * existing role-based check (canMutate/canInviteRole/canChangeRole/
 * canManageMember). Deliberately does NOT gate invitation *revocation*
 * (DELETE .../members/invitations/[invitationId]) — revoking a pending
 * invite reduces standing risk rather than creating new operational
 * state, so it remains available even while suspended (documented
 * asymmetry, see the Phase 10A completion report).
 */
export function requireActiveOrganization(
  organization: Organization,
): RequireActiveOrganizationResult {
  if (organization.status === "suspended") {
    return { ok: false, status: 403, reason: "organization_suspended" };
  }
  if (organization.status === "pending") {
    return { ok: false, status: 403, reason: "organization_pending" };
  }
  return { ok: true };
}

export interface OrganizationAccess {
  organization: Organization;
  membership: OrganizationMember;
  role: OrganizationRole;
}

export type LoadOrganizationAccessResult =
  | { ok: true; access: OrganizationAccess }
  | { ok: false; status: 404 | 403 };

/**
 * Thin wrapper over loadOrganizationMembership's result, named to make
 * read-vs-mutation call sites self-documenting: a route that only needs
 * loadOrganizationAccess (no requireActiveOrganization call after it) is
 * declaring itself read-only/suspension-tolerant by construction.
 */
export function loadOrganizationAccess(
  result: LoadOrganizationResult,
): LoadOrganizationAccessResult {
  if (!result.ok) return { ok: false, status: result.status };
  return {
    ok: true,
    access: {
      organization: result.organization,
      membership: result.membership,
      role: result.membership.role,
    },
  };
}
