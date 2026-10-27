import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { adminUsers } from "@incidentrank/db";
import { db } from "./db";
import type { AdminRole } from "./admin-auth";

/**
 * Owner-protection guards (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.5, phase8loc.md Step
 * 2B). Because admin_users_single_owner_idx guarantees at most one
 * "owner" row can ever exist (see schema.ts), the "last active owner"
 * is simply "the active owner" — there is no multi-owner count to reason
 * about the way organization-auth.ts's countOwners does for org-scoped
 * ownership. These are still real server-side checks, never left to
 * disabled UI alone: a self-revoke/self-demote attempt on the sole owner
 * must be rejected even if the request bypasses the client entirely.
 */

async function countActiveOwners(excludingUserId?: string): Promise<number> {
  const owners = await db.query.adminUsers.findMany({
    where: excludingUserId
      ? and(
          eq(adminUsers.role, "owner"),
          isNull(adminUsers.revokedAt),
          ne(adminUsers.userId, excludingUserId),
        )
      : and(eq(adminUsers.role, "owner"), isNull(adminUsers.revokedAt)),
    columns: { id: true },
  });
  return owners.length;
}

/**
 * Whether revoking `targetUserId` (currently holding `targetRole`) would
 * leave zero active owners. True for any attempt (self or otherwise) to
 * revoke the sole remaining owner.
 */
export async function wouldLeaveNoOwner(
  targetRole: AdminRole,
  targetUserId: string,
): Promise<boolean> {
  if (targetRole !== "owner") return false;
  const remaining = await countActiveOwners(targetUserId);
  return remaining === 0;
}

/**
 * Whether demoting `targetUserId` away from "owner" to `nextRole` would
 * leave zero active owners.
 */
export async function wouldDemoteLastOwner(
  targetRole: AdminRole,
  nextRole: AdminRole,
  targetUserId: string,
): Promise<boolean> {
  if (targetRole !== "owner" || nextRole === "owner") return false;
  const remaining = await countActiveOwners(targetUserId);
  return remaining === 0;
}
