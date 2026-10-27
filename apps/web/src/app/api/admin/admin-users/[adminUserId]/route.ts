import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminUsers } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership, isOwnerRole } from "@/lib/server/admin-auth";
import { wouldLeaveNoOwner } from "@/lib/server/admin-ownership";
import { logAdminAction } from "@/lib/server/admin-audit";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

/**
 * Revokes an admin membership. Owner-only mutation (mirrors the
 * organization role-change pattern's owner-only policy) with the
 * mandatory last-owner guard (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.5 /
 * phase8loc.md Step 2B: "last active owner cannot revoke themselves" —
 * generalized here to "the sole remaining owner can never be revoked by
 * anyone," since there is at most one owner by design).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ adminUserId: string }> },
) {
  if (!isAdminPortalEnabled()) {
    return NextResponse.json({ error: "Admin portal is not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await loadAdminMembership(user);
  if (!membership.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isOwnerRole(membership.membership.role)) {
    return NextResponse.json({ error: "Owner-only action" }, { status: 403 });
  }

  const { adminUserId } = await params;
  const target = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, adminUserId),
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const wouldLeaveZeroOwners = await wouldLeaveNoOwner(target.role, target.userId);
  if (wouldLeaveZeroOwners) {
    return NextResponse.json(
      { error: "The sole remaining owner cannot be revoked" },
      { status: 409 },
    );
  }

  await db
    .update(adminUsers)
    .set({ revokedAt: new Date() })
    .where(eq(adminUsers.id, adminUserId));

  await logAdminAction(db, {
    adminUserId: user.id,
    action: "admin_revoked",
    targetType: "admin_user",
    targetId: target.id,
  });

  return NextResponse.json({ ok: true });
}
