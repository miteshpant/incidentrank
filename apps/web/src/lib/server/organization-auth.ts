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
